import type { Category, CategoryKind } from '@nido/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForActionError, useSession } from '@/auth/session-provider';
import {
  ActionButton,
  AppScreen,
  Card,
  FormField,
  InlineNotice,
  LoadingContent,
  PageHeader,
  m1TextStyles,
} from '@/components/m1-ui';
import { themeTokens } from '@/theme/tokens';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'loaded'; readonly categories: readonly Category[] };

interface Draft {
  readonly id?: string;
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly parentId: string | null;
  readonly isActive: boolean;
}

const EMPTY_DRAFT: Draft = {
  kind: 'EXPENSE',
  name: '',
  icon: 'pricetag',
  color: '#6D5BD0',
  parentId: null,
  isActive: true,
};

export default function CategoriesScreen() {
  const { catalog, state } = useSession();
  const household = state.kind === 'authenticated' ? state.activeHousehold : null;
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  const load = useCallback(async () => {
    if (household === null) return;
    setLoadState({ kind: 'loading' });
    try {
      const { categories } = await catalog.listCategories(household.id);
      setLoadState({ kind: 'loaded', categories });
    } catch (error) {
      setLoadState({ kind: 'error', message: messageForActionError(error) });
    }
  }, [catalog, household]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (household === null) {
    return (
      <AppScreen centered>
        <LoadingContent />
      </AppScreen>
    );
  }
  const householdId = household.id;

  const categories = loadState.kind === 'loaded' ? loadState.categories : [];
  const roots = categories.filter(
    (category) => category.parentId === null && category.kind === (draft?.kind ?? 'EXPENSE'),
  );

  async function save(): Promise<void> {
    if (draft === null) return;
    setSaving(true);
    setFormError(undefined);
    try {
      if (draft.id === undefined) {
        await catalog.createCategory(householdId, {
          kind: draft.kind,
          name: draft.name,
          icon: draft.icon,
          color: draft.color,
          ...(draft.parentId === null ? {} : { parentId: draft.parentId }),
        });
      } else {
        await catalog.updateCategory(householdId, draft.id, {
          name: draft.name,
          icon: draft.icon,
          color: draft.color,
          parentId: draft.parentId,
          isActive: draft.isActive,
        });
      }
      setDraft(null);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    } finally {
      setSaving(false);
    }
  }

  async function archive(category: Category): Promise<void> {
    try {
      await catalog.deleteCategory(householdId, category.id);
      await load();
    } catch (error) {
      setFormError(messageForActionError(error));
    }
  }

  return (
    <AppScreen>
      <ActionButton
        label="Volver"
        onPress={() => {
          router.back();
        }}
        variant="secondary"
      />
      <PageHeader
        description="Categorías y subcategorías compartidas del hogar."
        title="Categorías"
      />
      {draft === null ? (
        <ActionButton
          label="Agregar categoría"
          onPress={() => {
            setDraft(EMPTY_DRAFT);
          }}
        />
      ) : (
        <Card>
          <Text style={m1TextStyles.sectionTitle}>
            {draft.id === undefined ? 'Nueva categoría' : 'Editar categoría'}
          </Text>
          {draft.id === undefined ? (
            <ChoiceRow
              label="Tipo"
              options={[
                ['EXPENSE', 'Egreso'],
                ['INCOME', 'Ingreso'],
              ]}
              selected={draft.kind}
              onSelect={(kind) => {
                setDraft({ ...draft, kind, parentId: null });
              }}
            />
          ) : null}
          <FormField
            label="Nombre"
            maxLength={100}
            onChangeText={(name) => {
              setDraft({ ...draft, name });
            }}
            value={draft.name}
          />
          <FormField
            label="Ícono"
            maxLength={50}
            onChangeText={(icon) => {
              setDraft({ ...draft, icon });
            }}
            value={draft.icon}
          />
          <FormField
            autoCapitalize="characters"
            label="Color hexadecimal"
            maxLength={7}
            onChangeText={(color) => {
              setDraft({ ...draft, color });
            }}
            value={draft.color}
          />
          <ChoiceRow
            label="Nivel"
            options={[
              [null, 'Categoría principal'],
              ...roots
                .filter((root) => root.id !== draft.id)
                .map((root) => [root.id, root.name] as const),
            ]}
            selected={draft.parentId}
            onSelect={(parentId) => {
              setDraft({ ...draft, parentId });
            }}
          />
          {draft.id === undefined ? null : (
            <ChoiceRow
              label="Estado"
              options={[
                [true, 'Activa'],
                [false, 'Archivada'],
              ]}
              selected={draft.isActive}
              onSelect={(isActive) => {
                setDraft({ ...draft, isActive });
              }}
            />
          )}
          {formError === undefined ? null : <InlineNotice tone="error">{formError}</InlineNotice>}
          <ActionButton
            disabled={
              draft.name.trim() === '' ||
              draft.icon.trim() === '' ||
              !/^#[0-9A-Fa-f]{6}$/u.test(draft.color)
            }
            label="Guardar"
            loading={saving}
            onPress={() => void save()}
          />
          <ActionButton
            label="Cancelar"
            onPress={() => {
              setDraft(null);
            }}
            variant="secondary"
          />
        </Card>
      )}

      {loadState.kind === 'loading' ? <LoadingContent label="Cargando categorías…" /> : null}
      {loadState.kind === 'error' ? (
        <>
          <InlineNotice tone="error">{loadState.message}</InlineNotice>
          <ActionButton label="Reintentar" onPress={() => void load()} variant="secondary" />
        </>
      ) : null}
      {loadState.kind === 'loaded' && categories.length === 0 ? (
        <InlineNotice>Todavía no hay categorías.</InlineNotice>
      ) : null}
      {(['EXPENSE', 'INCOME'] as const).map((kind) => (
        <View key={kind} style={styles.section}>
          <Text style={m1TextStyles.sectionTitle}>
            {kind === 'EXPENSE' ? 'Egresos' : 'Ingresos'}
          </Text>
          {categories
            .filter((category) => category.kind === kind && category.parentId === null)
            .map((root) => (
              <CategoryRow key={root.id} category={root} onArchive={archive} onEdit={setDraft}>
                {categories
                  .filter((child) => child.parentId === root.id)
                  .map((child) => (
                    <CategoryRow
                      child
                      key={child.id}
                      category={child}
                      onArchive={archive}
                      onEdit={setDraft}
                    />
                  ))}
              </CategoryRow>
            ))}
        </View>
      ))}
    </AppScreen>
  );
}

function CategoryRow({
  category,
  child = false,
  children,
  onArchive,
  onEdit,
}: {
  readonly category: Category;
  readonly child?: boolean;
  readonly children?: React.ReactNode;
  readonly onArchive: (category: Category) => Promise<void>;
  readonly onEdit: (draft: Draft) => void;
}) {
  return (
    <View style={[styles.rowGroup, child && styles.child]}>
      <Card>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={m1TextStyles.body}>{category.name}</Text>
            <Text style={m1TextStyles.secondary}>
              {category.isActive ? category.icon : `${category.icon} · Archivada`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onEdit({
                id: category.id,
                kind: category.kind,
                name: category.name,
                icon: category.icon,
                color: category.color,
                parentId: category.parentId,
                isActive: category.isActive,
              });
            }}
          >
            <Text style={styles.link}>Editar</Text>
          </Pressable>
          {category.isActive ? (
            <Pressable accessibilityRole="button" onPress={() => void onArchive(category)}>
              <Text style={styles.danger}>Archivar</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
      {children}
    </View>
  );
}

function ChoiceRow<T extends string | boolean | null>({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly (readonly [T, string])[];
  readonly selected: T;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      <Text style={m1TextStyles.secondary}>{label}</Text>
      <View style={styles.wrap}>
        {options.map(([value, text]) => (
          <Pressable
            accessibilityRole="button"
            key={String(value)}
            onPress={() => {
              onSelect(value);
            }}
            style={[styles.choice, selected === value && styles.selected]}
          >
            <Text style={m1TextStyles.secondary}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: themeTokens.spacing.cardGap },
  rowGroup: { gap: themeTokens.spacing.base },
  child: { marginLeft: themeTokens.spacing.cardPadding },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  link: {
    color: themeTokens.colors.primary,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  danger: {
    color: themeTokens.semanticColors.danger.foreground,
    fontFamily: themeTokens.typography.families.bodySemibold,
  },
  choices: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: themeTokens.colors.borderStrong,
    borderRadius: themeTokens.radii.chip,
    paddingHorizontal: 12,
  },
  selected: {
    backgroundColor: themeTokens.colors.primaryTint,
    borderColor: themeTokens.colors.primary,
  },
});
