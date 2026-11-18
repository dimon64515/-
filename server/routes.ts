import { Router, type Request, type Response } from 'express';
import {
  clearSessionCookie,
  createSessionToken,
  extractTokenFromRequest,
  requireAuth,
  setSessionCookie,
  verifySessionToken,
} from './auth.ts';
import {
  createBackup,
  db,
  getBackupFilePath,
  getNextDocNumber,
  getSetting,
  hashPassword,
  listBackups,
  setSetting,
  verifyPassword,
} from './db.ts';
import {
  convertToBaseUnit,
  formatQty,
  roundQty,
  type AppSettings,
  type DailyReportRow,
  type DocumentLine,
  type DocumentLineInput,
  type DocumentType,
  type Material,
  type NumberingMode,
  type PeriodCounterpartyRow,
  type PeriodMaterialRow,
  type WarehouseDocument,
} from '../src/types.ts';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RawMaterialRow {
  id: number;
  name: string;
  base_unit: string;
  specific_weight: number | null;
  rod_length: number | null;
  min_stock: number | null;
  is_active: number;
  created_at: string;
  current_stock: number;
  has_movements: number;
}

interface RawDocRow {
  id: number;
  doc_number: string;
  doc_type: DocumentType;
  doc_date: string;
  counterparty: string;
  through_whom: string;
  basis: string;
  note: string;
  status: 'active' | 'cancelled';
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

function getMaterialStock(materialId: number): number {
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN d.doc_type = 'income' THEN dl.base_qty
          WHEN d.doc_type = 'adjustment' THEN dl.base_qty
          WHEN d.doc_type = 'expense' THEN -dl.base_qty
          ELSE 0
        END
      ), 0) AS stock
      FROM document_lines dl
      JOIN documents d ON d.id = dl.document_id
      WHERE d.status = 'active' AND dl.material_id = ?
    `
    )
    .get(materialId) as { stock: number } | undefined;

  return roundQty(row ? row.stock : 0);
}

function mapMaterial(row: RawMaterialRow): Material {
  return {
    id: row.id,
    name: row.name,
    base_unit: row.base_unit,
    specific_weight: row.specific_weight,
    rod_length: row.rod_length,
    min_stock: row.min_stock,
    is_active: row.is_active === 1,
    current_stock: roundQty(row.current_stock),
    has_movements: row.has_movements === 1,
    created_at: row.created_at,
  };
}

function getDocumentWithLines(docId: number): WarehouseDocument | null {
  const doc = db
    .prepare(
      `
      SELECT id, doc_number, doc_type, doc_date, counterparty, through_whom, basis, note,
             status, cancelled_at, cancel_reason, created_at
      FROM documents
      WHERE id = ?
    `
    )
    .get(docId) as RawDocRow | undefined;

  if (!doc) return null;

  const lines = db
    .prepare(
      `
      SELECT dl.id, dl.document_id, dl.material_id, m.name AS material_name, m.base_unit,
             dl.input_qty, dl.input_unit, dl.base_qty,
             dl.specific_weight_snapshot, dl.rod_length_snapshot
      FROM document_lines dl
      JOIN materials m ON m.id = dl.material_id
      WHERE dl.document_id = ?
      ORDER BY dl.id ASC
    `
    )
    .all(docId) as DocumentLine[];

  return {
    ...doc,
    lines: lines.map((l) => ({
      ...l,
      input_qty: roundQty(l.input_qty),
      base_qty: roundQty(l.base_qty),
    })),
  };
}

export function createApiRouter(): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // --- Auth ---
  router.get('/auth/status', (req: Request, res: Response) => {
    const token = extractTokenFromRequest(req);
    const authenticated = verifySessionToken(token);
    const isDefaultPassword = getSetting('is_default_password', '1') === '1';
    res.json({ authenticated, isDefaultPassword });
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Введите пароль' });
      return;
    }

    const storedHash = getSetting('password_hash');
    if (!verifyPassword(password, storedHash)) {
      res.status(401).json({ error: 'Неверный пароль' });
      return;
    }

    const token = createSessionToken();
    setSessionCookie(res, token);
    const isDefaultPassword = getSetting('is_default_password', '1') === '1';
    res.json({ ok: true, token, isDefaultPassword });
  });

  router.post('/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Protected routes below
  router.use(requireAuth);

  router.post('/auth/change-password', (req: Request, res: Response) => {
    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Заполните текущий и новый пароль' });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ error: 'Новый пароль должен содержать минимум 4 символа' });
      return;
    }

    const storedHash = getSetting('password_hash');
    if (!verifyPassword(currentPassword, storedHash)) {
      res.status(400).json({ error: 'Текущий пароль указан неверно' });
      return;
    }

    setSetting('password_hash', hashPassword(newPassword));
    setSetting('is_default_password', '0');
    res.json({ ok: true });
  });

  // --- Materials ---
  router.get('/materials', (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    const rows = db
      .prepare(
        `
        SELECT
          m.id, m.name, m.base_unit, m.specific_weight, m.rod_length, m.min_stock, m.is_active, m.created_at,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN d.doc_type = 'income' THEN dl.base_qty
                WHEN d.doc_type = 'adjustment' THEN dl.base_qty
                WHEN d.doc_type = 'expense' THEN -dl.base_qty
                ELSE 0
              END
            )
            FROM document_lines dl
            JOIN documents d ON d.id = dl.document_id
            WHERE d.status = 'active' AND dl.material_id = m.id
          ), 0) AS current_stock,
          EXISTS(SELECT 1 FROM document_lines dl2 WHERE dl2.material_id = m.id) AS has_movements
        FROM materials m
        ${activeOnly ? 'WHERE m.is_active = 1' : ''}
        ORDER BY m.is_active DESC, m.name COLLATE NOCASE ASC
      `
      )
      .all() as RawMaterialRow[];

    res.json(rows.map(mapMaterial));
  });

  router.post('/materials', (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const baseUnit = typeof req.body?.base_unit === 'string' ? req.body.base_unit.trim() : '';
    const specificWeight =
      req.body?.specific_weight !== null && req.body?.specific_weight !== undefined && req.body?.specific_weight !== ''
        ? Number(req.body.specific_weight)
        : null;
    const rodLength =
      req.body?.rod_length !== null && req.body?.rod_length !== undefined && req.body?.rod_length !== ''
        ? Number(req.body.rod_length)
        : null;
    const minStock =
      req.body?.min_stock !== null && req.body?.min_stock !== undefined && req.body?.min_stock !== ''
        ? Number(req.body.min_stock)
        : null;

    if (!name) {
      res.status(400).json({ error: 'Укажите наименование материала' });
      return;
    }
    if (!baseUnit) {
      res.status(400).json({ error: 'Укажите базовую единицу измерения' });
      return;
    }
    if (specificWeight !== null && (!Number.isFinite(specificWeight) || specificWeight <= 0)) {
      res.status(400).json({ error: 'Удельный вес должен быть положительным числом' });
      return;
    }
    if (rodLength !== null && (!Number.isFinite(rodLength) || rodLength <= 0)) {
      res.status(400).json({ error: 'Длина хлыста должна быть положительным числом' });
      return;
    }
    if (minStock !== null && (!Number.isFinite(minStock) || minStock < 0)) {
      res.status(400).json({ error: 'Минимальный остаток не может быть отрицательным' });
      return;
    }

    const result = db
      .prepare(
        `
        INSERT INTO materials (name, base_unit, specific_weight, rod_length, min_stock, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `
      )
      .run(name, baseUnit, specificWeight, rodLength, minStock);

    const created = db
      .prepare(
        `
        SELECT id, name, base_unit, specific_weight, rod_length, min_stock, is_active, created_at,
               0 AS current_stock, 0 AS has_movements
        FROM materials WHERE id = ?
      `
      )
      .get(result.lastInsertRowid) as RawMaterialRow;

    res.status(201).json(mapMaterial(created));
  });

  router.put('/materials/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID материала' });
      return;
    }

    const existing = db.prepare('SELECT id FROM materials WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Материал не найден' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const baseUnit = typeof req.body?.base_unit === 'string' ? req.body.base_unit.trim() : '';
    const specificWeight =
      req.body?.specific_weight !== null && req.body?.specific_weight !== undefined && req.body?.specific_weight !== ''
        ? Number(req.body.specific_weight)
        : null;
    const rodLength =
      req.body?.rod_length !== null && req.body?.rod_length !== undefined && req.body?.rod_length !== ''
        ? Number(req.body.rod_length)
        : null;
    const minStock =
      req.body?.min_stock !== null && req.body?.min_stock !== undefined && req.body?.min_stock !== ''
        ? Number(req.body.min_stock)
        : null;
    const isActive = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;

    if (!name || !baseUnit) {
      res.status(400).json({ error: 'Наименование и базовая единица обязательны' });
      return;
    }
    if (specificWeight !== null && (!Number.isFinite(specificWeight) || specificWeight <= 0)) {
      res.status(400).json({ error: 'Удельный вес должен быть положительным числом' });
      return;
    }
    if (rodLength !== null && (!Number.isFinite(rodLength) || rodLength <= 0)) {
      res.status(400).json({ error: 'Длина хлыста должна быть положительным числом' });
      return;
    }
    if (minStock !== null && (!Number.isFinite(minStock) || minStock < 0)) {
      res.status(400).json({ error: 'Минимальный остаток не может быть отрицательным' });
      return;
    }

    db.prepare(
      `
      UPDATE materials
      SET name = ?, base_unit = ?, specific_weight = ?, rod_length = ?, min_stock = ?, is_active = ?
      WHERE id = ?
    `
    ).run(name, baseUnit, specificWeight, rodLength, minStock, isActive, id);

    const updated = db
      .prepare(
        `
        SELECT
          m.id, m.name, m.base_unit, m.specific_weight, m.rod_length, m.min_stock, m.is_active, m.created_at,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN d.doc_type = 'income' THEN dl.base_qty
                WHEN d.doc_type = 'adjustment' THEN dl.base_qty
                WHEN d.doc_type = 'expense' THEN -dl.base_qty
                ELSE 0
              END
            )
            FROM document_lines dl
            JOIN documents d ON d.id = dl.document_id
            WHERE d.status = 'active' AND dl.material_id = m.id
          ), 0) AS current_stock,
          EXISTS(SELECT 1 FROM document_lines dl2 WHERE dl2.material_id = m.id) AS has_movements
        FROM materials m
        WHERE m.id = ?
      `
      )
      .get(id) as RawMaterialRow;

    res.json(mapMaterial(updated));
  });

  router.delete('/materials/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID материала' });
      return;
    }

    const used = db.prepare('SELECT 1 FROM document_lines WHERE material_id = ? LIMIT 1').get(id);
    if (used) {
      res.status(400).json({
        error: 'Удаление запрещено: по этому материалу уже были операции. Используйте скрытие (неактивен).',
      });
      return;
    }

    db.prepare('DELETE FROM materials WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // --- Counterparties autocomplete ---
  router.get('/counterparties', (req: Request, res: Response) => {
    const type = req.query.type === 'income' || req.query.type === 'expense' ? req.query.type : null;
    const rows = db
      .prepare(
        `
        SELECT counterparty, MAX(doc_date) AS last_date, COUNT(*) AS cnt
        FROM documents
        WHERE counterparty != ''
          ${type ? 'AND doc_type = ?' : "AND doc_type IN ('income', 'expense')"}
        GROUP BY counterparty
        ORDER BY cnt DESC, last_date DESC
        LIMIT 50
      `
      )
      .all(...(type ? [type] : [])) as Array<{ counterparty: string }>;

    res.json(rows.map((r) => r.counterparty));
  });

  // --- Documents & Journal ---
  router.get('/documents', (req: Request, res: Response) => {
    const docType = typeof req.query.type === 'string' ? req.query.type : '';
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';
    const materialId = req.query.materialId ? Number(req.query.materialId) : null;
    const counterparty = typeof req.query.counterparty === 'string' ? req.query.counterparty.trim() : '';
    const docNumber = typeof req.query.docNumber === 'string' ? req.query.docNumber.trim() : '';
    const includeCancelled = req.query.includeCancelled !== '0';

    const where: string[] = [];
    const params: unknown[] = [];

    if (docType && ['income', 'expense', 'adjustment'].includes(docType)) {
      where.push('d.doc_type = ?');
      params.push(docType);
    }
    if (!includeCancelled) {
      where.push("d.status = 'active'");
    }
    if (dateFrom) {
      where.push('d.doc_date >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('d.doc_date <= ?');
      params.push(dateTo);
    }
    if (counterparty) {
      where.push('LOWER(d.counterparty) LIKE LOWER(?)');
      params.push(`%${counterparty}%`);
    }
    if (docNumber) {
      where.push('LOWER(d.doc_number) LIKE LOWER(?)');
      params.push(`%${docNumber}%`);
    }
    if (materialId && Number.isInteger(materialId)) {
      where.push('EXISTS (SELECT 1 FROM document_lines dlf WHERE dlf.document_id = d.id AND dlf.material_id = ?)');
      params.push(materialId);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const docs = db
      .prepare(
        `
        SELECT d.id, d.doc_number, d.doc_type, d.doc_date, d.counterparty, d.through_whom, d.basis, d.note,
               d.status, d.cancelled_at, d.cancel_reason, d.created_at
        FROM documents d
        ${whereSql}
        ORDER BY d.doc_date DESC, d.id DESC
        LIMIT 300
      `
      )
      .all(...params) as RawDocRow[];

    if (docs.length === 0) {
      res.json([]);
      return;
    }

    const docIds = docs.map((d) => d.id);
    const placeholders = docIds.map(() => '?').join(',');
    const allLines = db
      .prepare(
        `
        SELECT dl.id, dl.document_id, dl.material_id, m.name AS material_name, m.base_unit,
               dl.input_qty, dl.input_unit, dl.base_qty,
               dl.specific_weight_snapshot, dl.rod_length_snapshot
        FROM document_lines dl
        JOIN materials m ON m.id = dl.material_id
        WHERE dl.document_id IN (${placeholders})
        ORDER BY dl.id ASC
      `
      )
      .all(...docIds) as DocumentLine[];

    const linesByDoc = new Map<number, DocumentLine[]>();
    for (const line of allLines) {
      const list = linesByDoc.get(line.document_id) || [];
      list.push({
        ...line,
        input_qty: roundQty(line.input_qty),
        base_qty: roundQty(line.base_qty),
      });
      linesByDoc.set(line.document_id, list);
    }

    const result: WarehouseDocument[] = docs.map((d) => ({
      ...d,
      lines: linesByDoc.get(d.id) || [],
    }));

    res.json(result);
  });

  router.get('/documents/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID документа' });
      return;
    }
    const doc = getDocumentWithLines(id);
    if (!doc) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }
    res.json(doc);
  });

  router.post('/documents', (req: Request, res: Response) => {
    const docType = req.body?.doc_type as DocumentType;
    const docDate = typeof req.body?.doc_date === 'string' ? req.body.doc_date.trim() : '';
    const counterparty = typeof req.body?.counterparty === 'string' ? req.body.counterparty.trim() : '';
    const throughWhom = typeof req.body?.through_whom === 'string' ? req.body.through_whom.trim() : '';
    const basis = typeof req.body?.basis === 'string' ? req.body.basis.trim() : '';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    if (!['income', 'expense', 'adjustment'].includes(docType)) {
      res.status(400).json({ error: 'Некорректный тип операции' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
      res.status(400).json({ error: 'Укажите корректную дату документа' });
      return;
    }

    try {
      const createdId = db.transaction(() => {
        if (docType === 'adjustment') {
          const materialId = Number(req.body?.material_id);
          const actualQty = Number(req.body?.actual_qty);
          if (!Number.isInteger(materialId) || materialId <= 0) {
            throw new ApiError(400, 'Выберите материал для корректировки');
          }
          if (!Number.isFinite(actualQty) || actualQty < 0) {
            throw new ApiError(400, 'Фактическое количество не может быть отрицательным');
          }

          const mat = db
            .prepare('SELECT id, name, base_unit, specific_weight, rod_length FROM materials WHERE id = ?')
            .get(materialId) as
            | {
                id: number;
                name: string;
                base_unit: string;
                specific_weight: number | null;
                rod_length: number | null;
              }
            | undefined;

          if (!mat) {
            throw new ApiError(404, 'Материал не найден');
          }

          const currentStock = getMaterialStock(materialId);
          const delta = roundQty(actualQty - currentStock);
          if (delta === 0) {
            throw new ApiError(
              400,
              `Фактическое количество (${formatQty(actualQty)} ${mat.base_unit}) совпадает с текущим остатком`
            );
          }

          const docNumber = getNextDocNumber('adjustment', docDate);
          const docRes = db
            .prepare(
              `
              INSERT INTO documents (doc_number, doc_type, doc_date, counterparty, through_whom, basis, note, status)
              VALUES (?, 'adjustment', ?, 'Инвентаризация', '', ?, ?, 'active')
            `
            )
            .run(
              docNumber,
              docDate,
              `Было: ${formatQty(currentStock)} ${mat.base_unit}, факт: ${formatQty(actualQty)} ${mat.base_unit}`,
              note || 'Корректировка остатка'
            );

          const docId = Number(docRes.lastInsertRowid);
          db.prepare(
            `
            INSERT INTO document_lines (
              document_id, material_id, input_qty, input_unit, base_qty,
              specific_weight_snapshot, rod_length_snapshot
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `
          ).run(docId, mat.id, delta, mat.base_unit, delta, mat.specific_weight, mat.rod_length);

          return docId;
        }

        // income or expense
        if (!counterparty) {
          throw new ApiError(
            400,
            docType === 'income' ? 'Укажите контрагента («От кого»)' : 'Укажите контрагента («Кому»)'
          );
        }

        const rawLines = Array.isArray(req.body?.lines) ? (req.body.lines as DocumentLineInput[]) : [];
        if (rawLines.length === 0) {
          throw new ApiError(400, 'Добавьте хотя бы одну строку с материалом');
        }

        const preparedLines: Array<{
          material_id: number;
          material_name: string;
          base_unit: string;
          input_qty: number;
          input_unit: string;
          base_qty: number;
          specific_weight: number | null;
          rod_length: number | null;
        }> = [];

        const requestedTotals = new Map<number, { name: string; base_unit: string; total: number }>();

        for (let i = 0; i < rawLines.length; i++) {
          const item = rawLines[i];
          const materialId = Number(item?.material_id);
          const inputQty = Number(item?.input_qty);
          const inputUnit = typeof item?.input_unit === 'string' ? item.input_unit.trim() : '';

          if (!Number.isInteger(materialId) || materialId <= 0) {
            throw new ApiError(400, `Строка ${i + 1}: выберите материал`);
          }
          if (!Number.isFinite(inputQty) || inputQty <= 0) {
            throw new ApiError(400, `Строка ${i + 1}: укажите количество больше нуля`);
          }

          const mat = db
            .prepare('SELECT id, name, base_unit, specific_weight, rod_length FROM materials WHERE id = ?')
            .get(materialId) as
            | {
                id: number;
                name: string;
                base_unit: string;
                specific_weight: number | null;
                rod_length: number | null;
              }
            | undefined;

          if (!mat) {
            throw new ApiError(404, `Строка ${i + 1}: материал не найден`);
          }

          const effectiveUnit = inputUnit || mat.base_unit;
          const baseQty = convertToBaseUnit(inputQty, effectiveUnit, mat);
          if (baseQty === null || baseQty <= 0) {
            throw new ApiError(
              400,
              `Строка ${i + 1} («${mat.name}»): невозможно пересчитать из «${effectiveUnit}» в «${mat.base_unit}». Проверьте удельный вес и длину хлыста в справочнике.`
            );
          }

          preparedLines.push({
            material_id: mat.id,
            material_name: mat.name,
            base_unit: mat.base_unit,
            input_qty: roundQty(inputQty),
            input_unit: effectiveUnit,
            base_qty: baseQty,
            specific_weight: mat.specific_weight,
            rod_length: mat.rod_length,
          });

          const prev = requestedTotals.get(mat.id);
          requestedTotals.set(mat.id, {
            name: mat.name,
            base_unit: mat.base_unit,
            total: roundQty((prev ? prev.total : 0) + baseQty),
          });
        }

        // Strict stock check for expense
        if (docType === 'expense') {
          for (const [matId, info] of requestedTotals.entries()) {
            const currentStock = getMaterialStock(matId);
            if (roundQty(currentStock - info.total) < 0) {
              throw new ApiError(
                400,
                `Недостаточно на складе: «${info.name}» — доступно ${formatQty(currentStock)} ${info.base_unit}, запрошено ${formatQty(info.total)} ${info.base_unit}`
              );
            }
          }
        }

        const docNumber = getNextDocNumber(docType, docDate);
        const docRes = db
          .prepare(
            `
            INSERT INTO documents (doc_number, doc_type, doc_date, counterparty, through_whom, basis, note, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `
          )
          .run(docNumber, docType, docDate, counterparty, throughWhom, basis, note);

        const docId = Number(docRes.lastInsertRowid);
        const insertLine = db.prepare(
          `
          INSERT INTO document_lines (
            document_id, material_id, input_qty, input_unit, base_qty,
            specific_weight_snapshot, rod_length_snapshot
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        );

        for (const line of preparedLines) {
          insertLine.run(
            docId,
            line.material_id,
            line.input_qty,
            line.input_unit,
            line.base_qty,
            line.specific_weight,
            line.rod_length
          );
        }

        return docId;
      })();

      const created = getDocumentWithLines(createdId);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error creating document:', err);
      res.status(500).json({ error: 'Внутренняя ошибка при сохранении документа' });
    }
  });

  router.post('/documents/:id/cancel', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID документа' });
      return;
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    try {
      db.transaction(() => {
        const doc = getDocumentWithLines(id);
        if (!doc) {
          throw new ApiError(404, 'Документ не найден');
        }
        if (doc.status === 'cancelled') {
          throw new ApiError(400, 'Документ уже отменён');
        }

        // If income or positive adjustment is being cancelled, verify stock will not drop below 0
        if (doc.doc_type === 'income' || doc.doc_type === 'adjustment') {
          const byMaterial = new Map<number, { name: string; unit: string; delta: number }>();
          for (const line of doc.lines) {
            const prev = byMaterial.get(line.material_id);
            byMaterial.set(line.material_id, {
              name: line.material_name,
              unit: line.base_unit,
              delta: roundQty((prev ? prev.delta : 0) + line.base_qty),
            });
          }

          for (const [matId, info] of byMaterial.entries()) {
            if (info.delta > 0) {
              const currentStock = getMaterialStock(matId);
              if (roundQty(currentStock - info.delta) < 0) {
                throw new ApiError(
                  400,
                  `Нельзя отменить документ ${doc.doc_number}: по позиции «${info.name}» текущий остаток ${formatQty(currentStock)} ${info.unit}, а отменяется ${formatQty(info.delta)} ${info.unit}. По этому приходу уже было списание.`
                );
              }
            }
          }
        }

        db.prepare(
          `
          UPDATE documents
          SET status = 'cancelled',
              cancelled_at = datetime('now'),
              cancel_reason = ?
          WHERE id = ?
        `
        ).run(reason || 'Отменено пользователем', id);
      })();

      const updated = getDocumentWithLines(id);
      res.json(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error cancelling document:', err);
      res.status(500).json({ error: 'Ошибка при отмене документа' });
    }
  });

  // --- Reports ---
  router.get('/reports/daily', (req: Request, res: Response) => {
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : '';

    if (!date) {
      res.status(400).json({ error: 'Укажите дату отчёта в формате ГГГГ-ММ-ДД' });
      return;
    }

    const rows = db
      .prepare(
        `
        SELECT d.doc_type, d.doc_number, d.counterparty, m.name AS material_name,
               dl.base_qty, m.base_unit, dl.input_qty, dl.input_unit
        FROM documents d
        JOIN document_lines dl ON dl.document_id = d.id
        JOIN materials m ON m.id = dl.material_id
        WHERE d.status = 'active'
          AND d.doc_date = ?
          AND d.doc_type IN ('income', 'expense')
        ORDER BY d.id ASC, dl.id ASC
      `
      )
      .all(date) as Array<DailyReportRow & { doc_type: 'income' | 'expense' }>;

    const income: DailyReportRow[] = [];
    const expense: DailyReportRow[] = [];

    for (const r of rows) {
      const clean: DailyReportRow = {
        doc_number: r.doc_number,
        counterparty: r.counterparty,
        material_name: r.material_name,
        base_qty: roundQty(r.base_qty),
        base_unit: r.base_unit,
        input_qty: roundQty(r.input_qty),
        input_unit: r.input_unit,
      };
      if (r.doc_type === 'income') {
        income.push(clean);
      } else {
        expense.push(clean);
      }
    }

    res.json({ date, income, expense });
  });

  router.get('/reports/period', (req: Request, res: Response) => {
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';
    const materialId = req.query.materialId ? Number(req.query.materialId) : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      res.status(400).json({ error: 'Укажите корректный период (дата с / по)' });
      return;
    }

    const materialFilterSql = materialId && Number.isInteger(materialId) ? 'WHERE m.id = ?' : '';
    const matParams = materialId && Number.isInteger(materialId) ? [dateFrom, dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo, materialId] : [dateFrom, dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo];

    const materials = db
      .prepare(
        `
        SELECT
          m.id AS material_id,
          m.name AS material_name,
          m.base_unit,
          COALESCE(SUM(CASE
            WHEN d.status = 'active' AND d.doc_date < ? THEN
              CASE
                WHEN d.doc_type IN ('income', 'adjustment') THEN dl.base_qty
                WHEN d.doc_type = 'expense' THEN -dl.base_qty
                ELSE 0
              END
            ELSE 0
          END), 0) AS opening_stock,
          COALESCE(SUM(CASE
            WHEN d.status = 'active' AND d.doc_type = 'income' AND d.doc_date >= ? AND d.doc_date <= ? THEN dl.base_qty
            ELSE 0
          END), 0) AS income_qty,
          COALESCE(SUM(CASE
            WHEN d.status = 'active' AND d.doc_type = 'expense' AND d.doc_date >= ? AND d.doc_date <= ? THEN dl.base_qty
            ELSE 0
          END), 0) AS expense_qty,
          COALESCE(SUM(CASE
            WHEN d.status = 'active' AND d.doc_type = 'adjustment' AND d.doc_date >= ? AND d.doc_date <= ? THEN dl.base_qty
            ELSE 0
          END), 0) AS adjustment_qty
        FROM materials m
        LEFT JOIN document_lines dl ON dl.material_id = m.id
        LEFT JOIN documents d ON d.id = dl.document_id
        ${materialFilterSql}
        GROUP BY m.id
        ORDER BY m.name COLLATE NOCASE ASC
      `
      )
      .all(...matParams) as Array<Omit<PeriodMaterialRow, 'closing_stock'>>;

    const materialRows: PeriodMaterialRow[] = materials.map((row) => {
      const opening = roundQty(row.opening_stock);
      const inc = roundQty(row.income_qty);
      const exp = roundQty(row.expense_qty);
      const adj = roundQty(row.adjustment_qty);
      return {
        material_id: row.material_id,
        material_name: row.material_name,
        base_unit: row.base_unit,
        opening_stock: opening,
        income_qty: inc,
        expense_qty: exp,
        adjustment_qty: adj,
        closing_stock: roundQty(opening + inc + adj - exp),
      };
    });

    const cpFilter = materialId && Number.isInteger(materialId) ? 'AND dl.material_id = ?' : '';
    const cpParams = materialId && Number.isInteger(materialId) ? [dateFrom, dateTo, materialId] : [dateFrom, dateTo];

    const counterparties = db
      .prepare(
        `
        SELECT
          d.counterparty,
          d.doc_type,
          m.name AS material_name,
          m.base_unit,
          SUM(dl.base_qty) AS total_qty,
          COUNT(DISTINCT d.id) AS doc_count
        FROM documents d
        JOIN document_lines dl ON dl.document_id = d.id
        JOIN materials m ON m.id = dl.material_id
        WHERE d.status = 'active'
          AND d.doc_type IN ('income', 'expense')
          AND d.doc_date >= ? AND d.doc_date <= ?
          ${cpFilter}
        GROUP BY d.counterparty, d.doc_type, m.id
        ORDER BY d.doc_type ASC, total_qty DESC
      `
      )
      .all(...cpParams) as PeriodCounterpartyRow[];

    res.json({
      dateFrom,
      dateTo,
      materials: materialRows,
      counterparties: counterparties.map((c) => ({
        ...c,
        total_qty: roundQty(c.total_qty),
      })),
    });
  });

  // --- Settings ---
  router.get('/settings', (_req: Request, res: Response) => {
    const settings: AppSettings = {
      organization_name: getSetting('organization_name', 'ООО «Склад»'),
      director_name: getSetting('director_name', ''),
      accountant_name: getSetting('accountant_name', ''),
      warehouse_manager_name: getSetting('warehouse_manager_name', ''),
      issued_by_name: getSetting('issued_by_name', ''),
      received_by_name: getSetting('received_by_name', ''),
      numbering_mode: (getSetting('numbering_mode', 'continuous') === 'yearly' ? 'yearly' : 'continuous') as NumberingMode,
    };
    res.json(settings);
  });

  router.put('/settings', (req: Request, res: Response) => {
    const fields: Array<keyof AppSettings> = [
      'organization_name',
      'director_name',
      'accountant_name',
      'warehouse_manager_name',
      'issued_by_name',
      'received_by_name',
    ];

    for (const key of fields) {
      if (typeof req.body?.[key] === 'string') {
        setSetting(key, req.body[key].trim());
      }
    }

    if (req.body?.numbering_mode === 'continuous' || req.body?.numbering_mode === 'yearly') {
      setSetting('numbering_mode', req.body.numbering_mode);
    }

    const updated: AppSettings = {
      organization_name: getSetting('organization_name', 'ООО «Склад»'),
      director_name: getSetting('director_name', ''),
      accountant_name: getSetting('accountant_name', ''),
      warehouse_manager_name: getSetting('warehouse_manager_name', ''),
      issued_by_name: getSetting('issued_by_name', ''),
      received_by_name: getSetting('received_by_name', ''),
      numbering_mode: (getSetting('numbering_mode', 'continuous') === 'yearly' ? 'yearly' : 'continuous') as NumberingMode,
    };
    res.json(updated);
  });

  // --- Backups ---
  router.get('/backups', (_req: Request, res: Response) => {
    res.json(listBackups());
  });

  router.post('/backups', async (_req: Request, res: Response) => {
    try {
      const info = await createBackup('manual');
      res.status(201).json(info);
    } catch (err) {
      console.error('Manual backup error:', err);
      res.status(500).json({ error: 'Не удалось создать резервную копию базы данных' });
    }
  });

  router.get('/backups/:filename', (req: Request, res: Response) => {
    const filePath = getBackupFilePath(String(req.params.filename || ''));
    if (!filePath) {
      res.status(404).json({ error: 'Резервная копия не найдена' });
      return;
    }
    res.download(filePath);
  });

  return router;
}
