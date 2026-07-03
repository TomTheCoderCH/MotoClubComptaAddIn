# Gestion des membres et cotisations — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page "Membres" pour gérer le référentiel membres et suivre les cotisations annuelles (CHF 30/an), avec génération automatique d'écritures comptables pour les exercices présents en DB.

**Architecture:** Migration SQLite v4 (tables `members` + `member_dues`), fonctions DB ajoutées dans `app/src/db/index.ts`, 7 handlers IPC dans `app/src/ipc-handlers.ts`, 4 composants React (MembresPage + 3 modals). La logique de paiement (écriture + dues) vit dans une transaction atomique côté main process.

**Tech Stack:** Electron + React + TypeScript + SQLite (better-sqlite3) + CSS Modules + lucide-react + exceljs (déjà installé)

## Global Constraints

- Montants en **centimes** (INTEGER) — cotisation = 3000, surplus → compte 391 Dons
- CSS Modules uniquement — zéro `style={{}}` inline dans les composants
- Modales : toujours via `Modal.tsx` (`app/src/components/Modal.tsx`) — jamais recréer `.overlay` dans un CSS propre
- Confirmations destructives : `ConfirmDialog` — jamais `window.confirm`
- Compte cotisation : **300** ; compte dons : **391** (`name='Dons'`, `description='Dons divers'`) ; comptes débit acceptés : 100, 101, 102, 103
- Libellé écriture : `Cotisation {prénom} {nom} — {années jointes par "+"}` (ex. `Cotisation Thomas Merli — 2024+2025`)
- Écriture imputée à l'exercice de l'**année de `payment_date`** — erreur si cet exercice n'existe pas en DB
- Tests renderer : pattern `vi.stubGlobal('api', { ... })` dans `beforeEach` (voir `CaissePage.test.tsx`)
- Tous les commits sur la branche `feature/members-dues`
- Seed compte 391 : dans le tableau `seedMany()` de `seed.ts` ET dans le SQL de la migration v4 (`INSERT OR IGNORE`)

---

## Structure des fichiers

**Créés :**
- `app/src/pages/MembresPage.tsx` + `MembresPage.module.css`
- `app/src/components/MembreFormModal.tsx` + `MembreFormModal.module.css`
- `app/src/components/MembreDetailModal.tsx` + `MembreDetailModal.module.css`
- `app/src/components/MembrePaiementModal.tsx` + `MembrePaiementModal.module.css`
- `app/src/main/__tests__/members.test.ts`
- `app/src/main/__tests__/ipc-members-handlers.test.ts`
- `app/src/__tests__/renderer/MembresPage.test.tsx`
- `app/src/__tests__/renderer/MembreFormModal.test.tsx`
- `app/src/__tests__/renderer/MembreDetailModal.test.tsx`
- `app/src/__tests__/renderer/MembrePaiementModal.test.tsx`

**Modifiés :**
- `app/src/db/schema-migrations.ts` — migration v4
- `app/src/db/seed.ts` — compte 391
- `app/src/db/index.ts` — fonctions membres
- `app/src/types/index.ts` — 5 nouveaux types
- `app/src/ipc-handlers.ts` — 7 handlers IPC membres
- `app/src/preload.ts` — méthodes API membres
- `app/src/window.d.ts` — types window.api membres
- `app/src/App.tsx` — page 'members'
- `app/src/components/Sidebar.tsx` — entrée "Membres"
- `app/src/__tests__/schema-migrations.test.ts` — version v3 → v4
- `app/src/main/__tests__/cash.test.ts` — version v3 → v4

---

## Task 1 : Migration v4 + Seed compte 391

**Files:**
- Modify: `app/src/db/schema-migrations.ts`
- Modify: `app/src/db/seed.ts`
- Modify: `app/src/__tests__/schema-migrations.test.ts`
- Modify: `app/src/main/__tests__/cash.test.ts`

**Interfaces:**
- Produces: tables `members` et `member_dues` dans la DB, compte 391 présent après migration ou seed

- [ ] **Step 1 : Mettre à jour les tests existants (version v3 → v4)**

Dans `app/src/__tests__/schema-migrations.test.ts`, changer les deux occurrences de `3` en `4` :

```typescript
it('une base fraîche passe de user_version=0 à 4 (version courante)', () => {
  const db = freshDb();
  expect(getSchemaVersion(db)).toBe(0);
  runSchemaMigrations(db);
  expect(getSchemaVersion(db)).toBe(4);
});

it('une base déjà à jour (v4) n\'est pas modifiée', () => {
  const db = freshDb();
  runSchemaMigrations(db);
  runSchemaMigrations(db);
  expect(getSchemaVersion(db)).toBe(4);
});
```

Ajouter aussi un test pour les nouvelles tables :

```typescript
it('les tables members et member_dues existent après migration', () => {
  const db = freshDb();
  runSchemaMigrations(db);
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all() as { name: string }[];
  const names = tables.map(t => t.name);
  expect(names).toContain('members');
  expect(names).toContain('member_dues');
});
```

Dans `app/src/main/__tests__/cash.test.ts`, changer :
```typescript
// AVANT
it('schema version est 3', () => {
  const db = openDatabase(':memory:');
  expect(db.pragma('user_version', { simple: true })).toBe(3);
});

// APRÈS
it('schema version est 4', () => {
  const db = openDatabase(':memory:');
  expect(db.pragma('user_version', { simple: true })).toBe(4);
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|schema version|version courante)"
```

Expected : FAIL sur les tests de version.

- [ ] **Step 3 : Ajouter la migration v4 dans `schema-migrations.ts`**

Après l'entrée `version: 3`, ajouter :

```typescript
{
  version: 4,
  description: 'Tables membres et cotisations + compte 391',
  sql: `
CREATE TABLE members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name     TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  entry_date    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  inactive_note TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE member_dues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id        INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  paid             INTEGER NOT NULL DEFAULT 0,
  payment_note     TEXT,
  payment_date     TEXT,
  amount_cents     INTEGER,
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, year)
);
CREATE INDEX idx_member_dues_member ON member_dues(member_id);
CREATE INDEX idx_member_dues_year   ON member_dues(year);
INSERT OR IGNORE INTO accounts (number, name, class, type, normal_balance, description, account_group, must_be_zero_at_closing, is_closing_account)
VALUES ('391', 'Dons', 3, 'PRODUIT', 'CREDIT', 'Dons divers', NULL, 0, 0);
  `.trim(),
},
```

- [ ] **Step 4 : Ajouter le compte 391 dans `seed.ts`**

Dans le tableau passé à `seedMany([ ... ])`, ajouter après le compte 390 :

```typescript
{ number: '391', name: 'Dons', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Dons divers', account_group: null, must_be_zero_at_closing: 0, is_closing_account: 0 },
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|schema|members|member_dues)"
```

Expected : tous les tests de schema-migrations et cash passent.

- [ ] **Step 6 : Commit**

```bash
git add app/src/db/schema-migrations.ts app/src/db/seed.ts \
        app/src/__tests__/schema-migrations.test.ts \
        app/src/main/__tests__/cash.test.ts
git commit -m "feat(members): migration v4 — tables members/member_dues + seed compte 391"
```

---

## Task 2 : Types + Fonctions DB membres

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/db/index.ts`
- Create: `app/src/main/__tests__/members.test.ts`

**Interfaces:**
- Produces: `getAllMembers()`, `createMember()`, `updateMember()`, `deleteMember()`, `setHistoricalDues()`, `recordPayment()` exportées depuis `app/src/db/index.ts`

- [ ] **Step 1 : Ajouter les types dans `app/src/types/index.ts`**

À la fin du fichier, après la section `CashSessionPayload`, ajouter :

```typescript
// ─── Membres ─────────────────────────────────────────────────────────────────

export interface Member {
  id: number;
  last_name: string;
  first_name: string;
  entry_date: string | null;
  is_active: number;         // 0 | 1
  inactive_note: string | null;
  created_at: string;
}

export interface MemberDues {
  id: number;
  member_id: number;
  year: number;
  paid: number;              // 0 | 1
  payment_note: string | null;
  payment_date: string | null;
  amount_cents: number | null;
  journal_entry_id: number | null;
  created_at: string;
}

export interface MemberWithDues extends Member {
  dues: MemberDues[];
}

export interface MemberPayload {
  last_name: string;
  first_name: string;
  entry_date?: string | null;
  is_active: number;
  inactive_note?: string | null;
}

export interface MemberPaymentPayload {
  member_id: number;
  payment_date: string;           // ISO 8601 — détermine l'exercice comptable
  total_amount_cents: number;
  debit_account_id: number;       // 100 | 101 | 102 | 103
  years: number[];                // ex. [2025, 2026]
}
```

- [ ] **Step 2 : Écrire les tests d'abord dans `app/src/main/__tests__/members.test.ts`**

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase, getAllAccounts, createFiscalYear, createJournalEntry,
  getAllMembers, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
import type { MemberPayload, MemberPaymentPayload } from '../../types';

function freshDb() { openDatabase(':memory:'); }

function makeFy(): number {
  return createFiscalYear(2025).id;
}

function makeAccounts() {
  const accounts = getAllAccounts();
  return {
    a100: accounts.find(a => a.number === '100')!,
    a290: accounts.find(a => a.number === '290')!,
    a300: accounts.find(a => a.number === '300')!,
    a391: accounts.find(a => a.number === '391')!,
    a101: accounts.find(a => a.number === '101')!,
  };
}

function seedBalance(fyId: number, cents: number) {
  const { a100, a290 } = makeAccounts();
  createJournalEntry({
    fiscal_year_id: fyId, date: '2025-01-01', description: 'Solde à nouveau',
    lines: [{ account_id: a100.id, debit: cents }, { account_id: a290.id, credit: cents }],
  });
}

// ── createMember / updateMember / deleteMember ──────────────────────────────

describe('createMember', () => {
  beforeEach(freshDb);

  it('crée un membre avec les champs de base', () => {
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.last_name).toBe('Merli');
    expect(m.first_name).toBe('Thomas');
    expect(m.is_active).toBe(1);
    expect(m.entry_date).toBeNull();
    expect(m.inactive_note).toBeNull();
  });

  it('crée un membre avec date d\'entrée et note', () => {
    const m = createMember({
      last_name: 'Dupont', first_name: 'Jean',
      entry_date: '2020-01-01', is_active: 0, inactive_note: 'Démission 2026',
    });
    expect(m.entry_date).toBe('2020-01-01');
    expect(m.is_active).toBe(0);
    expect(m.inactive_note).toBe('Démission 2026');
  });
});

describe('updateMember', () => {
  beforeEach(freshDb);

  it('met à jour le statut et la note', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    const updated = updateMember(m.id, { last_name: 'A', first_name: 'B', is_active: 0, inactive_note: 'Parti' });
    expect(updated.is_active).toBe(0);
    expect(updated.inactive_note).toBe('Parti');
  });
});

describe('deleteMember', () => {
  beforeEach(freshDb);

  it('supprime un membre sans cotisations', () => {
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    deleteMember(m.id);
    expect(getAllMembers()).toHaveLength(0);
  });

  it('refuse de supprimer un membre avec des cotisations', () => {
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    setHistoricalDues(m.id, 2020, true, 'Raiff');
    expect(() => deleteMember(m.id)).toThrow('cotisations');
  });
});

describe('getAllMembers', () => {
  beforeEach(freshDb);

  it('retourne les membres triés par nom puis prénom', () => {
    createMember({ last_name: 'Zorro', first_name: 'A', is_active: 1 });
    createMember({ last_name: 'Achard', first_name: 'B', is_active: 1 });
    const all = getAllMembers();
    expect(all[0].last_name).toBe('Achard');
    expect(all[1].last_name).toBe('Zorro');
  });

  it('inclut les dues de chaque membre', () => {
    const m = createMember({ last_name: 'M', first_name: 'N', is_active: 1 });
    setHistoricalDues(m.id, 2023, true, 'Caisse');
    const all = getAllMembers();
    expect(all[0].dues).toHaveLength(1);
    expect(all[0].dues[0].year).toBe(2023);
    expect(all[0].dues[0].paid).toBe(1);
  });
});

// ── setHistoricalDues ────────────────────────────────────────────────────────

describe('setHistoricalDues', () => {
  beforeEach(freshDb);

  it('crée une ligne de cotisation historique', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    const d = setHistoricalDues(m.id, 2022, true, 'Raiff');
    expect(d.paid).toBe(1);
    expect(d.payment_note).toBe('Raiff');
    expect(d.journal_entry_id).toBeNull();
  });

  it('upsert : met à jour si la ligne existe déjà', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    setHistoricalDues(m.id, 2022, true, 'Raiff');
    const d = setHistoricalDues(m.id, 2022, false, null);
    expect(d.paid).toBe(0);
    expect(d.payment_note).toBeNull();
    const all = getAllMembers();
    expect(all[0].dues).toHaveLength(1); // toujours 1 ligne, pas 2
  });
});

// ── recordPayment ────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  beforeEach(freshDb);

  it('paiement normal 30 CHF — crée écriture et dues', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    });
    expect(result.dues).toHaveLength(1);
    expect(result.dues[0].year).toBe(2025);
    expect(result.dues[0].paid).toBe(1);
    expect(result.dues[0].amount_cents).toBe(3000);
    expect(result.dues[0].journal_entry_id).toBe(result.journalEntryId);
  });

  it('paiement multi-années 60 CHF — 2 lignes dues, même journal_entry_id', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2024, 2025],
    });
    expect(result.dues).toHaveLength(2);
    expect(result.dues[0].journal_entry_id).toBe(result.dues[1].journal_entry_id);
  });

  it('surplus 40 CHF — écriture avec ligne 391', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a100, a300, a391 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 4000, debit_account_id: a100.id, years: [2025],
    });
    expect(result.dues).toHaveLength(1);
    // Vérifier que l'écriture a 3 lignes (débit 100, crédit 300, crédit 391)
    const { getDb } = await import('../../db');
    const lines = getDb().prepare(
      'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?'
    ).all(result.journalEntryId) as Array<{ account_id: number; debit: number | null; credit: number | null }>;
    expect(lines).toHaveLength(3);
    const credit391 = lines.find(l => l.account_id === a391.id);
    expect(credit391?.credit).toBe(1000);
    const credit300 = lines.find(l => l.account_id === a300.id);
    expect(credit300?.credit).toBe(3000);
  });

  it('paiement en avance pour année future (2026) — pas d\'exercice requis pour l\'année couverte', () => {
    const fyId = makeFy(); // exercice 2025
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    // payment_date en 2025 mais year=2026
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-12-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2025, 2026],
    });
    expect(result.dues).toHaveLength(2);
    const due2026 = result.dues.find(d => d.year === 2026);
    expect(due2026?.paid).toBe(1);
  });

  it('échoue si exercice de paiement absent de la DB', () => {
    openDatabase(':memory:'); // DB vide, pas d'exercice
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    })).toThrow('exercice');
  });

  it('échoue si montant insuffisant pour les années sélectionnées', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2024, 2025],
    })).toThrow('insuffisant');
  });

  it('échoue si une année est déjà marquée payée', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-04-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    })).toThrow('déjà');
  });

  it('libellé écriture = "Cotisation Prénom Nom — années"', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2024, 2025],
    });
    const { getDb } = await import('../../db');
    const entry = getDb().prepare(
      'SELECT description FROM journal_entries WHERE id = ?'
    ).get(result.journalEntryId) as { description: string };
    expect(entry.description).toBe('Cotisation Thomas Merli — 2024+2025');
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent**

```bash
cd app && npm test -- members.test --reporter=verbose 2>&1 | head -40
```

Expected : FAIL — `getAllMembers is not a function` ou similaire.

- [ ] **Step 4 : Ajouter les fonctions dans `app/src/db/index.ts`**

À la fin du fichier (après la section `─── Caisse ───`), ajouter les imports de types en tête du fichier (dans le bloc import existant), puis ajouter la section :

**Dans l'import de types en haut de `db/index.ts`** (modifier la ligne existante) :
```typescript
import type {
  // ... types existants ...
  Member, MemberDues, MemberWithDues, MemberPayload, MemberPaymentPayload,
} from '../types';
```

**À la fin du fichier**, ajouter :
```typescript
// ─── Membres ─────────────────────────────────────────────────────────────────

export function getAllMembers(): MemberWithDues[] {
  const members = getDb()
    .prepare('SELECT * FROM members ORDER BY last_name, first_name')
    .all() as Member[];
  const getDues = getDb().prepare(
    'SELECT * FROM member_dues WHERE member_id = ? ORDER BY year DESC'
  );
  return members.map(m => ({ ...m, dues: getDues.all(m.id) as MemberDues[] }));
}

export function createMember(payload: MemberPayload): Member {
  const { last_name, first_name, entry_date, is_active, inactive_note } = payload;
  const r = getDb().prepare(`
    INSERT INTO members (last_name, first_name, entry_date, is_active, inactive_note)
    VALUES (@last_name, @first_name, @entry_date, @is_active, @inactive_note)
  `).run({
    last_name, first_name,
    entry_date: entry_date ?? null,
    is_active,
    inactive_note: inactive_note ?? null,
  });
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(r.lastInsertRowid) as Member;
}

export function updateMember(id: number, payload: MemberPayload): Member {
  const { last_name, first_name, entry_date, is_active, inactive_note } = payload;
  getDb().prepare(`
    UPDATE members
    SET last_name = @last_name, first_name = @first_name, entry_date = @entry_date,
        is_active = @is_active, inactive_note = @inactive_note
    WHERE id = @id
  `).run({ last_name, first_name, entry_date: entry_date ?? null, is_active, inactive_note: inactive_note ?? null, id });
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(id) as Member;
}

export function deleteMember(id: number): void {
  const hasDues = (getDb()
    .prepare('SELECT EXISTS(SELECT 1 FROM member_dues WHERE member_id = ?)')
    .pluck().get(id) as number) === 1;
  if (hasDues) throw new Error('Impossible de supprimer ce membre : des cotisations existent');
  getDb().prepare('DELETE FROM members WHERE id = ?').run(id);
}

export function setHistoricalDues(
  memberId: number, year: number, paid: boolean, note: string | null,
): MemberDues {
  getDb().prepare(`
    INSERT INTO member_dues (member_id, year, paid, payment_note)
    VALUES (@member_id, @year, @paid, @payment_note)
    ON CONFLICT(member_id, year) DO UPDATE SET
      paid = excluded.paid,
      payment_note = excluded.payment_note
  `).run({ member_id: memberId, year, paid: paid ? 1 : 0, payment_note: note ?? null });
  return getDb().prepare(
    'SELECT * FROM member_dues WHERE member_id = ? AND year = ?'
  ).get(memberId, year) as MemberDues;
}

export function recordPayment(
  payload: MemberPaymentPayload,
): { dues: MemberDues[]; journalEntryId: number } {
  const { member_id, payment_date, total_amount_cents, debit_account_id, years } = payload;

  return getDb().transaction(() => {
    const paymentYear = parseInt(payment_date.slice(0, 4), 10);
    const fy = getDb()
      .prepare('SELECT id, is_closed FROM fiscal_years WHERE year = ?')
      .get(paymentYear) as { id: number; is_closed: number } | undefined;
    if (!fy) throw new Error(`Aucun exercice trouvé pour l'année ${paymentYear}`);

    const cotisationsCents = years.length * 3000;
    const surplusCents = total_amount_cents - cotisationsCents;
    if (surplusCents < 0) throw new Error('Montant insuffisant pour couvrir les années sélectionnées');

    for (const year of years) {
      const existing = getDb()
        .prepare('SELECT paid FROM member_dues WHERE member_id = ? AND year = ?')
        .get(member_id, year) as { paid: number } | undefined;
      if (existing?.paid === 1) throw new Error(`L'année ${year} est déjà marquée comme payée`);
    }

    const member = getDb()
      .prepare('SELECT first_name, last_name FROM members WHERE id = ?')
      .get(member_id) as { first_name: string; last_name: string } | undefined;
    if (!member) throw new Error('Membre introuvable');

    const acc300 = getDb()
      .prepare("SELECT id FROM accounts WHERE number = '300'")
      .get() as { id: number } | undefined;
    if (!acc300) throw new Error('Compte 300 introuvable');

    const acc391 = getDb()
      .prepare("SELECT id FROM accounts WHERE number = '391'")
      .get() as { id: number } | undefined;

    const description = `Cotisation ${member.first_name} ${member.last_name} — ${years.join('+')}`;
    const lines: Array<{ account_id: number; debit?: number; credit?: number }> = [
      { account_id: debit_account_id, debit: total_amount_cents },
      { account_id: acc300.id, credit: cotisationsCents },
    ];
    if (surplusCents > 0) {
      if (!acc391) throw new Error('Compte 391 introuvable');
      lines.push({ account_id: acc391.id, credit: surplusCents });
    }

    const entry = createJournalEntry({
      fiscal_year_id: fy.id, date: payment_date, description, lines,
    });

    const upsert = getDb().prepare(`
      INSERT INTO member_dues (member_id, year, paid, payment_date, amount_cents, journal_entry_id)
      VALUES (@member_id, @year, 1, @payment_date, 3000, @journal_entry_id)
      ON CONFLICT(member_id, year) DO UPDATE SET
        paid = 1, payment_date = excluded.payment_date,
        amount_cents = excluded.amount_cents,
        journal_entry_id = excluded.journal_entry_id
    `);
    for (const year of years) {
      upsert.run({ member_id, year, payment_date, journal_entry_id: entry.id });
    }

    const dues = years.map(year =>
      getDb()
        .prepare('SELECT * FROM member_dues WHERE member_id = ? AND year = ?')
        .get(member_id, year) as MemberDues
    );

    return { dues, journalEntryId: entry.id };
  })();
}
```

Note : le test `surplus 40 CHF` utilise `await import('../../db')` pour récupérer `getDb` — remplacer par un import statique en haut du fichier test.

- [ ] **Step 5 : Corriger l'import de `getDb` dans le test**

En haut de `members.test.ts`, ajouter `getDb` aux imports :
```typescript
import {
  openDatabase, getDb, getAllAccounts, createFiscalYear, createJournalEntry,
  getAllMembers, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
```

Et corriger les deux occurrences de `await import('../../db')` dans les tests pour utiliser directement `getDb`.

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd app && npm test -- members.test --reporter=verbose 2>&1 | tail -20
```

Expected : tous les tests PASS.

- [ ] **Step 7 : Commit**

```bash
git add app/src/types/index.ts app/src/db/index.ts app/src/main/__tests__/members.test.ts
git commit -m "feat(members): types + fonctions DB (CRUD membres, cotisations, recordPayment)"
```

---

## Task 3 : IPC handlers + preload + window.d.ts

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Create: `app/src/main/__tests__/ipc-members-handlers.test.ts`

**Interfaces:**
- Consumes: `getAllMembers`, `createMember`, `updateMember`, `deleteMember`, `setHistoricalDues`, `recordPayment` depuis `./db`
- Produces: `window.api.getMembers`, `window.api.createMember`, `window.api.updateMember`, `window.api.deleteMember`, `window.api.setHistoricalDues`, `window.api.recordPayment`, `window.api.importMembersFromExcel`

- [ ] **Step 1 : Écrire les tests IPC**

Créer `app/src/main/__tests__/ipc-members-handlers.test.ts` :

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: null, ...a: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app:    { getPath: vi.fn(), isPackaged: false, getAppPath: vi.fn().mockReturnValue('/app') },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../../db', () => ({
  getAllMembers:      vi.fn(),
  createMember:      vi.fn(),
  updateMember:      vi.fn(),
  deleteMember:      vi.fn(),
  setHistoricalDues: vi.fn(),
  recordPayment:     vi.fn(),
  // fonctions existantes requises par registerIpcHandlers
  getAllAccounts:     vi.fn(),
  getActiveAccounts: vi.fn(),
  getAllFiscalYears:  vi.fn(),
  createFiscalYear:  vi.fn(),
  getJournalEntries: vi.fn(),
  createJournalEntry:vi.fn(),
  updateJournalEntry:vi.fn(),
  deleteJournalEntry:vi.fn(),
  getAccountBalances:vi.fn(),
  getAccountBalancesExcludingClosing: vi.fn(),
  updateAccount:     vi.fn(),
  createAccount:     vi.fn(),
  deleteAccount:     vi.fn(),
  getDashboardData:  vi.fn(),
  getTwintSummary:   vi.fn(),
  getAnalyticsData:  vi.fn(),
  getAccountLedger:  vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview: vi.fn(),
  closeFiscalYear:   vi.fn(),
  reopenFiscalYear:  vi.fn(),
  getCashCounts:     vi.fn(),
  getCashCountById:  vi.fn(),
  createCashCount:   vi.fn(),
  updateCashCount:   vi.fn(),
  deleteCashCount:   vi.fn(),
  getCashSessions:   vi.fn(),
  createCashSession: vi.fn(),
  deleteCashSession: vi.fn(),
  getDb: vi.fn(() => ({
    pragma: vi.fn(),
    prepare: vi.fn(() => ({
      pluck: vi.fn(() => ({ get: vi.fn(() => 0) })),
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  })),
  getDbDir:     vi.fn(),
  openDatabase: vi.fn(),
  hasDbChanges: vi.fn(),
}));

vi.mock('../../settings', () => ({
  readSettings:  vi.fn(() => ({ dataDir: '/tmp', dashboardCards: [] })),
  writeSettings: vi.fn(),
}));

import {
  getAllMembers, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
import { registerIpcHandlers } from '../../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  registerIpcHandlers();
});

function call(channel: string, ...args: unknown[]) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Handler non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('members:getAll', () => {
  it('délègue à getAllMembers()', () => {
    (getAllMembers as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('members:getAll');
    expect(getAllMembers).toHaveBeenCalledOnce();
  });
});

describe('members:create', () => {
  it('délègue à createMember avec le payload', () => {
    const payload = { last_name: 'Merli', first_name: 'Thomas', is_active: 1 };
    call('members:create', payload);
    expect(createMember).toHaveBeenCalledWith(payload);
  });
});

describe('members:update', () => {
  it('délègue à updateMember avec id et payload', () => {
    const payload = { last_name: 'X', first_name: 'Y', is_active: 1 };
    call('members:update', 5, payload);
    expect(updateMember).toHaveBeenCalledWith(5, payload);
  });
});

describe('members:delete', () => {
  it('délègue à deleteMember avec id', () => {
    call('members:delete', 3);
    expect(deleteMember).toHaveBeenCalledWith(3);
  });
});

describe('members:setHistoricalDues', () => {
  it('délègue à setHistoricalDues avec les bons args', () => {
    call('members:setHistoricalDues', 1, 2022, true, 'Raiff');
    expect(setHistoricalDues).toHaveBeenCalledWith(1, 2022, true, 'Raiff');
  });
});

describe('members:recordPayment', () => {
  it('délègue à recordPayment avec le payload', () => {
    const payload = {
      member_id: 1, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: 2, years: [2025],
    };
    call('members:recordPayment', payload);
    expect(recordPayment).toHaveBeenCalledWith(payload);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- ipc-members-handlers --reporter=verbose 2>&1 | head -20
```

Expected : FAIL — handlers non enregistrés.

- [ ] **Step 3 : Ajouter les handlers dans `app/src/ipc-handlers.ts`**

**Ajouter aux imports en haut du fichier** (dans le bloc `from './db'`) :
```typescript
  getAllMembers,
  createMember,
  updateMember,
  deleteMember,
  setHistoricalDues,
  recordPayment,
```

**Ajouter aux imports de types** (dans le bloc `import type ... from './types'`) :
```typescript
  MemberPayload,
  MemberPaymentPayload,
```

**À la fin de la fonction `registerIpcHandlers()`**, avant la fermeture `}` :
```typescript
  // ─── Membres ────────────────────────────────────────────────────────────────
  ipcMain.handle('members:getAll', () => getAllMembers());
  ipcMain.handle('members:create', (_e, payload: MemberPayload) => createMember(payload));
  ipcMain.handle('members:update', (_e, id: number, payload: MemberPayload) => updateMember(id, payload));
  ipcMain.handle('members:delete', (_e, id: number) => deleteMember(id));
  ipcMain.handle('members:setHistoricalDues',
    (_e, memberId: number, year: number, paid: boolean, note: string | null) =>
      setHistoricalDues(memberId, year, paid, note)
  );
  ipcMain.handle('members:recordPayment', (_e, payload: MemberPaymentPayload) =>
    recordPayment(payload)
  );
  ipcMain.handle('members:importFromExcel', async () => {
    const excelPath = path.join(app.getAppPath(), '..', 'Documents', 'Cotisations - 2020-2026.xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    const sheet = workbook.worksheets[0];
    let imported = 0;
    let skipped = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const lastName  = String(row.getCell(1).value ?? '').trim();
      const firstName = String(row.getCell(2).value ?? '').trim();
      if (!lastName || !firstName) return;
      const existing = getDb()
        .prepare('SELECT id FROM members WHERE LOWER(last_name) = LOWER(?) AND LOWER(first_name) = LOWER(?)')
        .get(lastName, firstName);
      if (existing) { skipped++; } else {
        getDb().prepare('INSERT INTO members (last_name, first_name, is_active) VALUES (?, ?, 1)')
          .run(lastName, firstName);
        imported++;
      }
    });
    return { imported, skipped };
  });
```

Note : `app` et `path` sont déjà importés dans `ipc-handlers.ts`. Vérifier que `getDb` est aussi importé.

- [ ] **Step 4 : Mettre à jour `app/src/preload.ts`**

**Dans l'import de types en haut** :
```typescript
import type {
  // ... types existants ...
  Member, MemberDues, MemberWithDues, MemberPayload, MemberPaymentPayload,
} from './types';
```

**Dans `contextBridge.exposeInMainWorld('api', { ... })`**, ajouter à la fin :
```typescript
  // Membres
  getMembers:             (): Promise<MemberWithDues[]>    => ipcRenderer.invoke('members:getAll'),
  createMember:           (payload: MemberPayload): Promise<Member> => ipcRenderer.invoke('members:create', payload),
  updateMember:           (id: number, payload: MemberPayload): Promise<Member> => ipcRenderer.invoke('members:update', id, payload),
  deleteMember:           (id: number): Promise<void>      => ipcRenderer.invoke('members:delete', id),
  setHistoricalDues:      (memberId: number, year: number, paid: boolean, note: string | null): Promise<MemberDues> =>
    ipcRenderer.invoke('members:setHistoricalDues', memberId, year, paid, note),
  recordPayment:          (payload: MemberPaymentPayload): Promise<{ dues: MemberDues[]; journalEntryId: number }> =>
    ipcRenderer.invoke('members:recordPayment', payload),
  importMembersFromExcel: (): Promise<{ imported: number; skipped: number }> =>
    ipcRenderer.invoke('members:importFromExcel'),
```

**Dans `export type ElectronAPI`**, ajouter les mêmes signatures.

- [ ] **Step 5 : Mettre à jour `app/src/window.d.ts`**

**Ajouter l'import des types** en haut :
```typescript
import type {
  // ... types existants ...
  Member, MemberDues, MemberWithDues, MemberPayload, MemberPaymentPayload,
} from './types';
```

**Dans `interface Window { api: { ... } }`**, ajouter à la fin :
```typescript
      // Membres
      getMembers:             () => Promise<MemberWithDues[]>;
      createMember:           (payload: MemberPayload) => Promise<Member>;
      updateMember:           (id: number, payload: MemberPayload) => Promise<Member>;
      deleteMember:           (id: number) => Promise<void>;
      setHistoricalDues:      (memberId: number, year: number, paid: boolean, note: string | null) => Promise<MemberDues>;
      recordPayment:          (payload: MemberPaymentPayload) => Promise<{ dues: MemberDues[]; journalEntryId: number }>;
      importMembersFromExcel: () => Promise<{ imported: number; skipped: number }>;
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd app && npm test -- ipc-members-handlers --reporter=verbose 2>&1 | tail -15
```

Expected : tous PASS.

- [ ] **Step 7 : Vérifier que toute la suite passe**

```bash
cd app && npm test 2>&1 | tail -5
```

Expected : nombre de tests augmenté, 0 failures.

- [ ] **Step 8 : Commit**

```bash
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts \
        app/src/main/__tests__/ipc-members-handlers.test.ts
git commit -m "feat(members): handlers IPC + preload + window.d.ts"
```

---

## Task 4 : Navigation + MembresPage

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/Sidebar.tsx`
- Create: `app/src/pages/MembresPage.tsx`
- Create: `app/src/pages/MembresPage.module.css`
- Create: `app/src/__tests__/renderer/MembresPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.getMembers()`, `window.api.getFiscalYears()`, `window.api.deleteMember()`
- Produces: page montée sur `currentPage === 'members'`, entrée sidebar "Membres"

- [ ] **Step 1 : Écrire les tests `MembresPage.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembresPage from '../../pages/MembresPage';
import type { FiscalYear, MemberWithDues } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01T00:00:00', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null,
  created_at: '2025-01-01T00:00:00',
  dues: [{ id: 1, member_id: 1, year: 2025, paid: 1, payment_note: null,
           payment_date: '2025-03-01', amount_cents: 3000, journal_entry_id: 10, created_at: '' }],
};

const mockMemberUnpaid: MemberWithDues = {
  id: 2, last_name: 'Dupont', first_name: 'Jean',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null,
  created_at: '2025-01-01T00:00:00',
  dues: [],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    getFiscalYears:         vi.fn().mockResolvedValue([mockYear]),
    getMembers:             vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
    deleteMember:           vi.fn().mockResolvedValue(undefined),
    importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 2, skipped: 0 }),
  });
});

describe('MembresPage', () => {
  it('affiche le titre Membres', async () => {
    render(<MembresPage />);
    await screen.findByText('Membres');
  });

  it('affiche les membres dans le tableau', async () => {
    render(<MembresPage />);
    await screen.findByText('Merli');
    expect(screen.getByText('Thomas')).toBeInTheDocument();
    expect(screen.getByText('Dupont')).toBeInTheDocument();
  });

  it('affiche le badge payé pour 2025 sur Merli', async () => {
    render(<MembresPage />);
    await screen.findByText('Merli');
    // Le badge ✓ pour l'année 2025 doit apparaître
    const badges = screen.getAllByText(/✓/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('bouton Nouveau membre est présent', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /nouveau membre/i });
  });

  it('bouton Importer depuis Excel est présent', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /importer/i });
  });

  it('message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([]),
    });
    render(<MembresPage />);
    await screen.findByText(/aucun membre/i);
  });

  it('confirme avant import et affiche le résultat', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /importer/i });
    await userEvent.click(screen.getByRole('button', { name: /importer/i }));
    await screen.findByText(/2 membre\(s\) importé\(s\)/i);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3 : Modifier `App.tsx`**

Ajouter `'members'` au type `Page` :
```typescript
export type Page = 'dashboard' | 'accounts' | 'journal' | 'cash' | 'members' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'ledger' | 'settings' | 'welcome';
```

Ajouter l'import :
```typescript
import MembresPage from './pages/MembresPage';
```

Ajouter dans `renderPage()` :
```typescript
case 'members':      return <MembresPage />;
```

- [ ] **Step 4 : Modifier `Sidebar.tsx`**

Ajouter l'entrée entre `cash` et `fiscal-years` dans `NAV_ITEMS` :
```typescript
{ id: 'members',      label: 'Membres'        },
```

La liste devient :
```typescript
const NAV_ITEMS: Array<{ id: Page; label: string }> = [
  { id: 'dashboard',    label: 'Accueil'        },
  { id: 'accounts',     label: 'Plan comptable' },
  { id: 'journal',      label: 'Journal'        },
  { id: 'cash',         label: 'Caisse'         },
  { id: 'members',      label: 'Membres'        },
  { id: 'fiscal-years', label: 'Exercices'      },
  { id: 'balances',     label: 'Soldes'         },
  { id: 'analytics',    label: 'Analytique'     },
  { id: 'bilan',        label: 'Bilan complet'  },
  { id: 'settings',     label: 'Paramètres'     },
];
```

- [ ] **Step 5 : Créer `MembresPage.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload, UserX, UserCheck } from 'lucide-react';
import MembreFormModal    from '../components/MembreFormModal';
import MembreDetailModal  from '../components/MembreDetailModal';
import ConfirmDialog      from '../components/ConfirmDialog';
import Toast              from '../components/Toast';
import { formatDate }     from '../lib/format';
import type { FiscalYear, MemberWithDues } from '../types';
import styles from './MembresPage.module.css';

export default function MembresPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [members,        setMembers]        = useState<MemberWithDues[]>([]);
  const [showInactive,   setShowInactive]   = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMember,     setEditMember]     = useState<MemberWithDues | null>(null);
  const [detailMember,   setDetailMember]   = useState<MemberWithDues | null>(null);
  const [deleteId,       setDeleteId]       = useState<number | null>(null);
  const [toast,          setToast]          = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [importing,      setImporting]      = useState(false);

  const load = useCallback(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getMembers(),
    ]).then(([ys, ms]) => {
      setYears(ys);
      setMembers(ms);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const recentYears = years
    .map(y => y.year)
    .sort((a, b) => b - a)
    .slice(0, 3);

  const visible = members.filter(m => showInactive ? true : m.is_active === 1);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.api.deleteMember(deleteId);
      setToast({ message: 'Membre supprimé', variant: 'success' });
      load();
    } catch {
      setToast({ message: 'Impossible de supprimer : des cotisations existent', variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (m: MemberWithDues) => {
    await window.api.updateMember(m.id, {
      last_name: m.last_name, first_name: m.first_name,
      entry_date: m.entry_date, is_active: m.is_active === 1 ? 0 : 1,
      inactive_note: m.inactive_note,
    });
    load();
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.api.importMembersFromExcel();
      setToast({ message: `${result.imported} membre(s) importé(s), ${result.skipped} ignoré(s)`, variant: 'success' });
      load();
    } catch {
      setToast({ message: 'Erreur lors de l\'import', variant: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const isPaid = (m: MemberWithDues, year: number) =>
    m.dues.some(d => d.year === year && d.paid === 1);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Membres</h1>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Afficher les inactifs
          </label>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.btnSecondary}
            onClick={handleImport}
            disabled={importing}
          >
            <Upload size={16} /> {importing ? 'Import…' : 'Importer depuis Excel'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => { setEditMember(null); setShowCreateModal(true); }}
          >
            <Plus size={16} /> Nouveau membre
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>Aucun membre. Utilisez "Nouveau membre" ou "Importer depuis Excel".</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Entrée</th>
              <th>Statut</th>
              {recentYears.map(y => <th key={y} className={styles.num}>{y}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr
                key={m.id}
                className={`${styles.row} ${m.is_active === 0 ? styles.inactive : ''}`}
                onClick={() => setDetailMember(m)}
                style={{ cursor: 'pointer' }}
              >
                <td>{m.last_name}</td>
                <td>{m.first_name}</td>
                <td>{m.entry_date ? formatDate(m.entry_date) : '—'}</td>
                <td>
                  {m.is_active === 0
                    ? <span className={styles.badgeInactif}>Inactif</span>
                    : <span className={styles.badgeActif}>Actif</span>
                  }
                </td>
                {recentYears.map(y => (
                  <td key={y} className={styles.num}>
                    {isPaid(m, y)
                      ? <span className={styles.paid}>✓</span>
                      : <span className={styles.unpaid}>—</span>
                    }
                  </td>
                ))}
                <td className={styles.actions} onClick={e => e.stopPropagation()}>
                  <button
                    className={styles.btnIcon}
                    onClick={() => { setEditMember(m); setShowCreateModal(true); }}
                    aria-label="Modifier"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className={styles.btnIcon}
                    onClick={() => handleToggleActive(m)}
                    aria-label={m.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                  >
                    {m.is_active === 1 ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => setDeleteId(m.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreateModal && (
        <MembreFormModal
          member={editMember ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditMember(null); }}
          onSaved={() => { setShowCreateModal(false); setEditMember(null); load(); setToast({ message: editMember ? 'Membre modifié' : 'Membre créé', variant: 'success' }); }}
        />
      )}

      {detailMember && (
        <MembreDetailModal
          member={detailMember}
          fiscalYears={years}
          onClose={() => setDetailMember(null)}
          onUpdated={() => { load(); setDetailMember(null); }}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer ce membre ? Cette action est irréversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 6 : Créer `MembresPage.module.css`**

```css
.page       { padding: 1.5rem; max-width: 1100px; }
.header     { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
.headerLeft { display: flex; align-items: center; gap: 1rem; }
.headerRight{ display: flex; gap: 0.5rem; }
.title      { margin: 0; font-size: 1.25rem; font-weight: 700; }
.toggleLabel{ display: flex; align-items: center; gap: 0.4rem; font-size: var(--font-size-sm); color: var(--text-muted); cursor: pointer; }

.table    { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.table th { text-align: left; padding: 0.5rem 0.75rem; font-weight: 600; border-bottom: 2px solid var(--border); white-space: nowrap; }
.table td { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--border-light); }
.row:hover td { background: var(--hover); }
.inactive td  { opacity: 0.55; }
.num      { text-align: center; }

.badgeActif   { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; background: #dcfce7; color: #166534; }
.badgeInactif { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; background: var(--border-light); color: var(--text-muted); }
.paid   { color: var(--success, #166534); font-weight: 700; }
.unpaid { color: var(--text-muted); }

.empty   { color: var(--text-muted); font-style: italic; padding: 2rem 0; }
.actions { display: flex; gap: 0.25rem; white-space: nowrap; }

.btnPrimary {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.45rem 0.875rem; background: var(--accent); color: var(--text-on-accent);
  border: none; border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm);
}
.btnSecondary {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.45rem 0.875rem; background: none; color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius);
  cursor: pointer; font-size: var(--font-size-sm);
}
.btnSecondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btnIcon {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.3rem; background: none; border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer; color: var(--text-subtle);
}
.btnIcon:hover { background: var(--hover); }
.btnDanger {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.3rem; background: none; border: 1px solid var(--error);
  border-radius: var(--radius-sm); cursor: pointer; color: var(--error);
}
.btnDanger:hover { background: var(--error); color: var(--text-on-accent); }
```

- [ ] **Step 7 : Vérifier que les tests passent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -15
```

Expected : tous PASS.

- [ ] **Step 8 : Commit**

```bash
git add app/src/App.tsx app/src/components/Sidebar.tsx \
        app/src/pages/MembresPage.tsx app/src/pages/MembresPage.module.css \
        app/src/__tests__/renderer/MembresPage.test.tsx
git commit -m "feat(members): page Membres + navigation sidebar"
```

---

## Task 5 : MembreFormModal

**Files:**
- Create: `app/src/components/MembreFormModal.tsx`
- Create: `app/src/components/MembreFormModal.module.css`
- Create: `app/src/__tests__/renderer/MembreFormModal.test.tsx`

**Interfaces:**
- Consumes: `window.api.createMember(payload)`, `window.api.updateMember(id, payload)`
- Produces: `<MembreFormModal member? onClose onSaved />`

- [ ] **Step 1 : Écrire les tests**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembreFormModal from '../../components/MembreFormModal';
import type { MemberWithDues } from '../../types';

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null,
  created_at: '', dues: [],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createMember: vi.fn().mockResolvedValue({ id: 2, ...mockMember }),
    updateMember: vi.fn().mockResolvedValue(mockMember),
  });
});

describe('MembreFormModal — création', () => {
  it('affiche les champs Nom, Prénom, Date d\'entrée, Statut', () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/nom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date d.entrée/i)).toBeInTheDocument();
  });

  it('bouton Créer désactivé si Nom vide', async () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('button', { name: /créer/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/prénom/i), 'Thomas');
    expect(screen.getByRole('button', { name: /créer/i })).toBeDisabled();
  });

  it('appelle createMember et onSaved après soumission', async () => {
    const onSaved = vi.fn();
    render(<MembreFormModal onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/nom/i), 'Merli');
    await userEvent.type(screen.getByLabelText(/prénom/i), 'Thomas');
    await userEvent.click(screen.getByRole('button', { name: /créer/i }));
    expect(window.api.createMember).toHaveBeenCalledWith(
      expect.objectContaining({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('note visible uniquement si statut inactif', async () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/inactif/i));
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });
});

describe('MembreFormModal — modification', () => {
  it('prérempli avec les données du membre', () => {
    render(<MembreFormModal member={mockMember} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByDisplayValue('Merli')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thomas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
  });

  it('appelle updateMember avec l\'id correct', async () => {
    render(<MembreFormModal member={mockMember} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText(/nom/i));
    await userEvent.type(screen.getByLabelText(/nom/i), 'Merli2');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(window.api.updateMember).toHaveBeenCalledWith(1, expect.objectContaining({ last_name: 'Merli2' }));
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembreFormModal.test --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3 : Créer `MembreFormModal.tsx`**

```typescript
import { useState } from 'react';
import Modal from './Modal';
import type { MemberWithDues, MemberPayload } from '../types';
import styles from './MembreFormModal.module.css';

interface Props {
  member?: MemberWithDues;
  onClose: () => void;
  onSaved: () => void;
}

export default function MembreFormModal({ member, onClose, onSaved }: Props) {
  const isEdit = !!member;
  const [lastName,     setLastName]     = useState(member?.last_name ?? '');
  const [firstName,    setFirstName]    = useState(member?.first_name ?? '');
  const [entryDate,    setEntryDate]    = useState(member?.entry_date ?? '');
  const [isActive,     setIsActive]     = useState(member ? member.is_active === 1 : true);
  const [inactiveNote, setInactiveNote] = useState(member?.inactive_note ?? '');
  const [saving,       setSaving]       = useState(false);

  const isValid = lastName.trim().length > 0 && firstName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const payload: MemberPayload = {
        last_name:     lastName.trim(),
        first_name:    firstName.trim(),
        entry_date:    entryDate || null,
        is_active:     isActive ? 1 : 0,
        inactive_note: !isActive ? (inactiveNote.trim() || null) : null,
      };
      if (isEdit) {
        await window.api.updateMember(member!.id, payload);
      } else {
        await window.api.createMember(payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>{isEdit ? 'Modifier le membre' : 'Nouveau membre'}</h2>
      <div className={styles.form}>
        <label className={styles.label}>
          Nom *
          <input
            className={styles.input}
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            autoFocus={!isEdit}
          />
        </label>
        <label className={styles.label}>
          Prénom *
          <input
            className={styles.input}
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          Date d&apos;entrée
          <input
            type="date"
            className={styles.input}
            value={entryDate}
            onChange={e => setEntryDate(e.target.value)}
          />
        </label>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Statut</legend>
          <label className={styles.radio}>
            <input type="radio" name="status" checked={isActive}  onChange={() => setIsActive(true)}  /> Actif
          </label>
          <label className={styles.radio}>
            <input type="radio" name="status" checked={!isActive} onChange={() => setIsActive(false)} /> Inactif
          </label>
        </fieldset>
        {!isActive && (
          <label className={styles.label}>
            Note
            <textarea
              className={styles.textarea}
              value={inactiveNote}
              onChange={e => setInactiveNote(e.target.value)}
              placeholder="Ex. Démission 2026"
              rows={2}
            />
          </label>
        )}
      </div>
      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Annuler</button>
        <button
          className={styles.btnSave}
          onClick={handleSubmit}
          disabled={!isValid || saving}
        >
          {isEdit ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4 : Créer `MembreFormModal.module.css`**

```css
.modal    { width: 480px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
.title    { margin: 0; font-size: 1.1rem; font-weight: 700; }
.form     { display: flex; flex-direction: column; gap: 0.875rem; }
.label    { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--font-size-sm); font-weight: 500; }
.input    { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--font-size-sm); background: var(--bg); color: var(--text); }
.textarea { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--font-size-sm); background: var(--bg); color: var(--text); resize: vertical; }
.fieldset { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; margin: 0; }
.legend   { font-size: var(--font-size-sm); font-weight: 500; padding: 0 0.25rem; }
.radio    { display: flex; align-items: center; gap: 0.4rem; font-size: var(--font-size-sm); cursor: pointer; margin: 0.25rem 0; }
.footer   { display: flex; justify-content: flex-end; gap: 0.5rem; }
.btnCancel { padding: 0.4rem 0.875rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnSave   { padding: 0.4rem 0.875rem; background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnSave:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd app && npm test -- MembreFormModal.test --reporter=verbose 2>&1 | tail -15
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/MembreFormModal.tsx app/src/components/MembreFormModal.module.css \
        app/src/__tests__/renderer/MembreFormModal.test.tsx
git commit -m "feat(members): MembreFormModal (création et modification d'un membre)"
```

---

## Task 6 : MembreDetailModal

**Files:**
- Create: `app/src/components/MembreDetailModal.tsx`
- Create: `app/src/components/MembreDetailModal.module.css`
- Create: `app/src/__tests__/renderer/MembreDetailModal.test.tsx`

**Interfaces:**
- Consumes: `window.api.setHistoricalDues()`, `window.api.getMembers()`
- Produces: `<MembreDetailModal member fiscalYears onClose onUpdated />`; déclenche `MembrePaiementModal`

- [ ] **Step 1 : Écrire les tests**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembreDetailModal from '../../components/MembreDetailModal';
import type { FiscalYear, MemberWithDues } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null,
  created_at: '',
  dues: [
    { id: 1, member_id: 1, year: 2023, paid: 1, payment_note: 'Raiff',
      payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' },
    { id: 2, member_id: 1, year: 2025, paid: 1, payment_note: null,
      payment_date: '2025-03-01', amount_cents: 3000, journal_entry_id: 5, created_at: '' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    setHistoricalDues: vi.fn().mockResolvedValue({ id: 3, member_id: 1, year: 2022, paid: 1, payment_note: 'Caisse', payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' }),
    getMembers:        vi.fn().mockResolvedValue([mockMember]),
    getFiscalYears:    vi.fn().mockResolvedValue([mockYear]),
    getActiveAccounts: vi.fn().mockResolvedValue([]),
  });
});

describe('MembreDetailModal', () => {
  it('affiche le nom complet du membre', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByText(/Thomas Merli/i)).toBeInTheDocument();
  });

  it('affiche les années historiques avec checkbox', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    // 2023 est hors exercices DB — doit apparaître comme historique avec note "Raiff"
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Raiff')).toBeInTheDocument();
  });

  it('affiche les années en DB avec badge statut', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByText('2025')).toBeInTheDocument();
    // 2025 est en DB et payé
    expect(screen.getByText(/payé/i)).toBeInTheDocument();
  });

  it('bouton Enregistrer un paiement est présent', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByRole('button', { name: /enregistrer un paiement/i })).toBeInTheDocument();
  });

  it('cocher une case historique appelle setHistoricalDues', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const checkbox = screen.getAllByRole('checkbox')[0];
    await userEvent.click(checkbox);
    expect(window.api.setHistoricalDues).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembreDetailModal.test --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3 : Créer `MembreDetailModal.tsx`**

```typescript
import { useState } from 'react';
import Modal from './Modal';
import MembrePaiementModal from './MembrePaiementModal';
import type { FiscalYear, MemberWithDues, MemberDues, Account } from '../types';
import styles from './MembreDetailModal.module.css';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function MembreDetailModal({ member, fiscalYears, onClose, onUpdated }: Props) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Calcul des années à afficher : union dues + fiscalYears, triées décroissant
  const fyYears = new Set(fiscalYears.map(y => y.year));
  const dueYears = new Set(member.dues.map(d => d.year));
  const allYears = [...new Set([...fyYears, ...dueYears])].sort((a, b) => b - a);

  const getDues = (year: number): MemberDues | undefined =>
    member.dues.find(d => d.year === year);

  const isHistorical = (year: number) => !fyYears.has(year);

  const handleCheckbox = async (year: number, checked: boolean) => {
    const existing = getDues(year);
    const note = existing?.payment_note ?? null;
    await window.api.setHistoricalDues(member.id, year, checked, note);
    onUpdated();
  };

  const handleNoteBlur = async (year: number, note: string) => {
    const existing = getDues(year);
    const paid = existing?.paid === 1;
    await window.api.setHistoricalDues(member.id, year, paid, note || null);
  };

  const openPayment = async () => {
    const accs = await window.api.getActiveAccounts();
    setAccounts(accs);
    setShowPaymentModal(true);
  };

  const hasOpenFy = fiscalYears.some(y => !y.is_closed);

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>{member.first_name} {member.last_name}</h2>
        <div className={styles.meta}>
          {member.entry_date && <span>Entré le {member.entry_date}</span>}
          <span className={member.is_active === 1 ? styles.actif : styles.inactif}>
            {member.is_active === 1 ? 'Actif' : 'Inactif'}
          </span>
          {member.inactive_note && <span className={styles.note}>{member.inactive_note}</span>}
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Année</th>
            <th>Statut</th>
            <th>Note / Mode</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          {allYears.map(year => {
            const dues = getDues(year);
            const historical = isHistorical(year);
            return (
              <tr key={year} className={styles.row}>
                <td className={styles.yearCell}>{year}</td>
                {historical ? (
                  <>
                    <td>
                      <input
                        type="checkbox"
                        checked={dues?.paid === 1}
                        onChange={e => handleCheckbox(year, e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.noteInput}
                        defaultValue={dues?.payment_note ?? ''}
                        onBlur={e => handleNoteBlur(year, e.target.value)}
                        placeholder="Mode paiement…"
                      />
                    </td>
                    <td className={styles.num}>—</td>
                  </>
                ) : (
                  <>
                    <td>
                      {dues?.paid === 1
                        ? <span className={styles.paid}>✓ Payé</span>
                        : <span className={styles.unpaid}>✗ Non payé</span>
                      }
                    </td>
                    <td className={styles.muted}>
                      {dues?.payment_date ?? '—'}
                    </td>
                    <td className={styles.num}>
                      {dues?.amount_cents != null
                        ? `CHF ${(dues.amount_cents / 100).toFixed(2)}`
                        : '—'
                      }
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Fermer</button>
        <button
          className={styles.btnPrimary}
          onClick={openPayment}
          disabled={!hasOpenFy}
        >
          Enregistrer un paiement
        </button>
      </div>

      {showPaymentModal && (
        <MembrePaiementModal
          member={member}
          fiscalYears={fiscalYears}
          accounts={accounts.filter(a => ['100', '101', '102', '103'].includes(a.number))}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); onUpdated(); }}
        />
      )}
    </Modal>
  );
}
```

- [ ] **Step 4 : Créer `MembreDetailModal.module.css`**

```css
.modal   { width: 600px; max-height: 80vh; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; }
.header  { display: flex; flex-direction: column; gap: 0.25rem; }
.title   { margin: 0; font-size: 1.1rem; font-weight: 700; }
.meta    { display: flex; gap: 0.75rem; align-items: center; font-size: var(--font-size-sm); color: var(--text-muted); }
.actif   { color: #166534; font-weight: 600; }
.inactif { color: var(--text-muted); }
.note    { font-style: italic; }

.table    { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
.table th { text-align: left; padding: 0.4rem 0.6rem; font-weight: 600; border-bottom: 2px solid var(--border); }
.table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border-light); }
.row:hover td { background: var(--hover); }
.yearCell { font-weight: 600; width: 4rem; }
.num      { text-align: right; font-variant-numeric: tabular-nums; }
.muted    { color: var(--text-muted); font-size: 0.8rem; }

.paid   { color: #166534; font-weight: 600; }
.unpaid { color: var(--text-muted); }

.noteInput { width: 100%; padding: 0.2rem 0.4rem; border: 1px solid var(--border); border-radius: 3px; font-size: 0.8rem; background: var(--bg); color: var(--text); }

.footer    { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
.btnCancel { padding: 0.4rem 0.875rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnPrimary {
  padding: 0.4rem 0.875rem; background: var(--accent); color: var(--text-on-accent);
  border: none; border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm);
}
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd app && npm test -- MembreDetailModal.test --reporter=verbose 2>&1 | tail -15
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/MembreDetailModal.tsx app/src/components/MembreDetailModal.module.css \
        app/src/__tests__/renderer/MembreDetailModal.test.tsx
git commit -m "feat(members): MembreDetailModal (historique cotisations + déclenchement paiement)"
```

---

## Task 7 : MembrePaiementModal

**Files:**
- Create: `app/src/components/MembrePaiementModal.tsx`
- Create: `app/src/components/MembrePaiementModal.module.css`
- Create: `app/src/__tests__/renderer/MembrePaiementModal.test.tsx`

**Interfaces:**
- Consumes: `window.api.recordPayment(payload: MemberPaymentPayload)`
- Produces: `<MembrePaiementModal member fiscalYears accounts onClose onSaved />`

- [ ] **Step 1 : Écrire les tests**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembrePaiementModal from '../../components/MembrePaiementModal';
import type { FiscalYear, MemberWithDues, Account } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null, created_at: '', dues: [],
};

const mockAccounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',      class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, account_group: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, has_entries: false, created_at: '' },
  { id: 2, number: '101', name: 'Raiffeisen',  class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, account_group: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, has_entries: false, created_at: '' },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    recordPayment: vi.fn().mockResolvedValue({ dues: [], journalEntryId: 99 }),
  });
});

describe('MembrePaiementModal', () => {
  it('affiche le nom du membre', () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/Thomas Merli/)).toBeInTheDocument();
  });

  it('montant par défaut = 30.00', () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByDisplayValue('30.00')).toBeInTheDocument();
  });

  it('1 case à cocher pour 30 CHF, 2 cases pour 60 CHF', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    // Défaut 30 CHF → 1 case
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    const input = screen.getByDisplayValue('30.00');
    await userEvent.clear(input);
    await userEvent.type(input, '60.00');
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
  });

  it('affiche le surplus si montant % 30 > 0', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    const input = screen.getByDisplayValue('30.00');
    await userEvent.clear(input);
    await userEvent.type(input, '40.00');
    await waitFor(() => expect(screen.getByText(/dons/i)).toBeInTheDocument());
    expect(screen.getByText(/10\.00/)).toBeInTheDocument();
  });

  it('bouton désactivé si pas assez de cases cochées', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByDisplayValue('30.00'));
    await userEvent.type(screen.getByDisplayValue(''), '60.00');
    // 2 cases possibles mais aucune cochée → désactivé
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('appelle recordPayment avec le bon payload', async () => {
    const onSaved = vi.fn();
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={onSaved} />);
    // Cocher la case 2025 (seule case présente pour 30 CHF)
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(window.api.recordPayment).toHaveBeenCalled());
    const call = (window.api.recordPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.member_id).toBe(1);
    expect(call.total_amount_cents).toBe(3000);
    expect(call.years).toContain(2025);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembrePaiementModal.test --reporter=verbose 2>&1 | head -20
```

- [ ] **Step 3 : Créer `MembrePaiementModal.tsx`**

```typescript
import { useState, useMemo } from 'react';
import Modal from './Modal';
import { formatCHF } from '../lib/format';
import type { FiscalYear, MemberWithDues, Account, MemberPaymentPayload } from '../types';
import styles from './MembrePaiementModal.module.css';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

export default function MembrePaiementModal({ member, fiscalYears, accounts, onClose, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [paymentDate, setPaymentDate]   = useState(today);
  const [amountStr,   setAmountStr]     = useState('30.00');
  const [debitAccId,  setDebitAccId]    = useState(accounts[0]?.id ?? 0);
  const [checkedYears, setCheckedYears] = useState<Set<number>>(new Set());
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState<string | null>(null);

  const amountCents = Math.round(parseFloat(amountStr || '0') * 100);
  const quota       = Math.floor(amountCents / 3000);
  const surplusCents = amountCents - quota * 3000;

  // Années proposées : toutes les années non encore payées, triées : courante, futures, passées
  const paidYears = new Set(member.dues.filter(d => d.paid === 1).map(d => d.year));
  const fyYears   = fiscalYears.map(y => y.year);
  const currentYear = new Date().getFullYear();

  const candidateYears = useMemo(() => {
    const baseYears = [...new Set([...fyYears, currentYear, currentYear + 1])];
    return baseYears
      .filter(y => !paidYears.has(y))
      .sort((a, b) => {
        if (a === currentYear) return -1;
        if (b === currentYear) return 1;
        if (a > currentYear && b <= currentYear) return -1;
        if (b > currentYear && a <= currentYear) return 1;
        return a - b;
      });
  }, [fyYears, paidYears, currentYear]);

  const toggleYear = (year: number) => {
    setCheckedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else if (next.size < quota) {
        next.add(year);
      }
      return next;
    });
  };

  const isValid = checkedYears.size === quota && quota > 0 && debitAccId > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const payload: MemberPaymentPayload = {
        member_id: member.id,
        payment_date: paymentDate,
        total_amount_cents: amountCents,
        debit_account_id: debitAccId,
        years: [...checkedYears].sort(),
      };
      await window.api.recordPayment(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const debitAcc = accounts.find(a => a.id === debitAccId);

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>Enregistrer un paiement</h2>
      <p className={styles.member}>{member.first_name} {member.last_name}</p>

      <div className={styles.form}>
        <label className={styles.label}>
          Date du paiement
          <input type="date" className={styles.input} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
        </label>

        <label className={styles.label}>
          Montant CHF
          <input
            type="number" step="0.05" min="0"
            className={styles.input}
            value={amountStr}
            onChange={e => { setAmountStr(e.target.value); setCheckedYears(new Set()); }}
          />
        </label>

        <label className={styles.label}>
          Mode de paiement
          <select
            className={styles.input}
            value={debitAccId}
            onChange={e => setDebitAccId(Number(e.target.value))}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
            ))}
          </select>
        </label>

        <div className={styles.yearsSection}>
          <div className={styles.yearsLabel}>
            Années couvertes
            <span className={styles.quota}>({checkedYears.size}/{quota} sélectionnée{quota > 1 ? 's' : ''})</span>
          </div>
          {quota === 0 ? (
            <p className={styles.hint}>Entrez un montant d&apos;au moins CHF 30.00</p>
          ) : (
            <div className={styles.yearsList}>
              {candidateYears.map(year => (
                <label key={year} className={styles.yearLabel}>
                  <input
                    type="checkbox"
                    checked={checkedYears.has(year)}
                    disabled={!checkedYears.has(year) && checkedYears.size >= quota}
                    onChange={() => toggleYear(year)}
                  />
                  {year}
                  {year > currentYear && <span className={styles.advance}> (avance)</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        {surplusCents > 0 && (
          <div className={styles.surplus}>
            Surplus → Dons (391) : <strong>{formatCHF(surplusCents)}</strong>
          </div>
        )}

        {isValid && (
          <div className={styles.preview}>
            <div className={styles.previewTitle}>Aperçu de l&apos;écriture</div>
            <div className={styles.previewLine}>
              <span>Débit {debitAcc?.number} {debitAcc?.name}</span>
              <span>{formatCHF(amountCents)}</span>
            </div>
            <div className={styles.previewLine}>
              <span>Crédit 300 Cotisations membres</span>
              <span>{formatCHF(quota * 3000)}</span>
            </div>
            {surplusCents > 0 && (
              <div className={styles.previewLine}>
                <span>Crédit 391 Dons</span>
                <span>{formatCHF(surplusCents)}</span>
              </div>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Annuler</button>
        <button className={styles.btnSave} onClick={handleSubmit} disabled={!isValid || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4 : Créer `MembrePaiementModal.module.css`**

```css
.modal   { width: 520px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.125rem; }
.title   { margin: 0; font-size: 1.1rem; font-weight: 700; }
.member  { margin: 0; font-weight: 600; color: var(--accent); }
.form    { display: flex; flex-direction: column; gap: 0.875rem; }
.label   { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--font-size-sm); font-weight: 500; }
.input   { padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--font-size-sm); background: var(--bg); color: var(--text); }

.yearsSection { display: flex; flex-direction: column; gap: 0.375rem; }
.yearsLabel   { font-size: var(--font-size-sm); font-weight: 500; display: flex; align-items: center; gap: 0.5rem; }
.quota        { font-weight: 400; color: var(--text-muted); font-size: 0.8rem; }
.yearsList    { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.yearLabel    { display: flex; align-items: center; gap: 0.3rem; font-size: var(--font-size-sm); cursor: pointer; border: 1px solid var(--border); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); }
.yearLabel:has(input:checked) { border-color: var(--accent); background: var(--accent-light, #eff6ff); }
.advance      { color: var(--text-muted); font-size: 0.75rem; }
.hint         { font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin: 0; }

.surplus  { background: #fef3c7; color: #92400e; padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); font-size: var(--font-size-sm); }
.preview  { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; background: var(--bg-secondary); font-size: var(--font-size-sm); display: flex; flex-direction: column; gap: 0.25rem; }
.previewTitle { font-weight: 600; margin-bottom: 0.25rem; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.previewLine  { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
.error { color: var(--error); font-size: var(--font-size-sm); }

.footer    { display: flex; justify-content: flex-end; gap: 0.5rem; }
.btnCancel { padding: 0.4rem 0.875rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnSave   { padding: 0.4rem 0.875rem; background: var(--accent); color: var(--text-on-accent); border: none; border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnSave:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd app && npm test -- MembrePaiementModal.test --reporter=verbose 2>&1 | tail -15
```

- [ ] **Step 6 : Vérifier toute la suite**

```bash
cd app && npm test 2>&1 | tail -5
```

Expected : 0 failures. Nombre de tests ≥ 660 (612 existants + ~50 nouveaux).

- [ ] **Step 7 : Commit final**

```bash
git add app/src/components/MembrePaiementModal.tsx app/src/components/MembrePaiementModal.module.css \
        app/src/__tests__/renderer/MembrePaiementModal.test.tsx
git commit -m "feat(members): MembrePaiementModal (saisie paiement + écriture comptable)"
```
