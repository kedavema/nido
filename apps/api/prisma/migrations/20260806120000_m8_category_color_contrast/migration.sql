-- A category avatar draws its glyph in the category color on a 15% tint of that same color, so
-- the applicable rule is WCAG text contrast (4.5:1). Six of the seed colors never met it — worst
-- was Reembolso's #56CCF2 at 1.69:1, where the icon is all but invisible — and Vivienda and
-- Servicios shipped the same hex, so their avatars were indistinguishable.
--
-- Colors are copied into per-household rows when the household is created, so correcting the seed
-- alone would leave every existing household with the failing values. This rewrites them.
--
-- The six contrast statements match on the old color and nothing else: a household may have
-- renamed the category, and subcategories inherit their root's color, so the color reaches both.
-- Each of those six hexes belongs to exactly one seed root, so there is no ambiguity.
--
-- Rows whose color was deliberately changed are left alone, including ones that also fail: the
-- color is a field households are allowed to edit, and overwriting a choice someone made is a
-- different act from correcting a default nobody chose. No destination value appears as a source
-- value, so re-running this migration is a no-op.

-- Servicios #3E5C76 -> #886108 (4.53:1); breaks the collision with Vivienda, which keeps #3E5C76.
--
-- This one hex is the exception to the rule above, because Vivienda holds it too and legitimately
-- passes the gate with it. Every field that could tell the two apart — name, icon, sort order —
-- is editable through the category update endpoint, so no single one of them is a safe key on its
-- own: renaming a Vivienda root to 'Servicios' is a supported operation, and a name-keyed
-- statement would then recolor Vivienda and its children instead, permanently and unreversed.
--
-- Requiring the entire seed signature to still be intact removes the guess. It matches only a row
-- nothing has touched, which is exactly the set this migration is allowed to rewrite. A household
-- that edited any of these fields keeps its Servicios duplicate — that costs a pair of lookalike
-- avatars, where guessing wrong costs a color the household chose.
UPDATE "categories" SET "color" = '#886108'
WHERE "color" = '#3E5C76'
  AND "kind" = 'EXPENSE'
  AND "name" = 'Servicios'
  AND "icon" = 'flash'
  AND "sort_order" = 4
  AND "parent_id" IS NULL;

-- Must run after the statement above, which is what the subquery recognises the root by. The
-- children carry no signature of their own worth matching — their names are the generic
-- 'Electricidad', 'Agua', 'Internet', 'Suscripciones' — so identifying the parent is the check,
-- and a child still holding the inherited hex is by definition one nobody recolored.
UPDATE "categories" SET "color" = '#886108'
WHERE "color" = '#3E5C76' AND "parent_id" IN (
  SELECT "id" FROM "categories"
  WHERE "color" = '#886108'
    AND "kind" = 'EXPENSE'
    AND "name" = 'Servicios'
    AND "icon" = 'flash'
    AND "sort_order" = 4
    AND "parent_id" IS NULL
);

-- Ocio 3.66:1 -> #6559C3 4.53:1
UPDATE "categories" SET "color" = '#6559C3' WHERE "color" = '#B4632F';

-- Sueldo 3.17:1 -> #3E6B34 5.06:1
UPDATE "categories" SET "color" = '#3E6B34' WHERE "color" = '#219653';

-- Trabajo independiente 2.61:1 -> #026AB6 4.52:1
UPDATE "categories" SET "color" = '#026AB6' WHERE "color" = '#2D9CDB';

-- Reembolso 1.69:1 -> #99469F 4.55:1
UPDATE "categories" SET "color" = '#99469F' WHERE "color" = '#56CCF2';

-- Venta 1.99:1 -> #886108 4.53:1
UPDATE "categories" SET "color" = '#886108' WHERE "color" = '#F2994A';

-- Otros ingresos 1.74:1 -> #5C6862 4.74:1
UPDATE "categories" SET "color" = '#5C6862' WHERE "color" = '#6FCF97';
