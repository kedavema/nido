import 'json_reader.dart';
import 'patch.dart';
import 'wire_codecs.dart';

/// Category contracts mirroring `packages/contracts/src/categories.ts`.
/// The shared fixtures under `packages/contracts/fixtures/` lock this parser
/// and the Zod schemas together.

/// `CATEGORY_KINDS` in `packages/domain-types`. A category belongs to exactly
/// one side of the ledger; a transaction may only use a category of its own
/// kind.
enum CategoryKind {
  expense('EXPENSE'),
  income('INCOME');

  const CategoryKind(this.wire);

  final String wire;

  static CategoryKind parseWire(String wire) {
    for (final kind in values) {
      if (kind.wire == wire) {
        return kind;
      }
    }
    throw FormatException('Unknown category kind', wire);
  }
}

/// `CategoryNameSchema`: `z.string().trim().min(1).max(100)`.
String parseCategoryName(String wire) =>
    parseTrimmedText(wire, min: 1, max: 100);

/// `CategoryIconSchema`: `z.string().trim().min(1).max(50)`.
String parseCategoryIcon(String wire) =>
    parseTrimmedText(wire, min: 1, max: 50);

final RegExp _hexColorPattern = RegExp(r'^#[0-9A-Fa-f]{6}$');

/// `CategoryColorSchema`: `#RRGGBB`, kept as the exact wire string so a
/// round-trip cannot change a household's stored colour casing.
String parseCategoryColor(String wire) {
  if (!_hexColorPattern.hasMatch(wire)) {
    throw FormatException('Not a #RRGGBB colour', wire);
  }
  return wire;
}

/// `CategorySchema`.
class Category {
  const Category({
    required this.id,
    required this.householdId,
    required this.kind,
    required this.parentId,
    required this.name,
    required this.icon,
    required this.color,
    required this.sortOrder,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String householdId;
  final CategoryKind kind;

  /// `null` for a root category. The taxonomy is exactly two levels deep, so
  /// a child never has children of its own.
  final String? parentId;
  final String name;
  final String icon;
  final String color;
  final int sortOrder;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isRoot => parentId == null;

  static Category fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return Category(
      id: reader.parse('id', parseUuid),
      householdId: reader.parse('householdId', parseUuid),
      kind: reader.parse('kind', CategoryKind.parseWire),
      parentId: reader.parseNullable('parentId', parseUuid),
      name: reader.parse('name', parseCategoryName),
      icon: reader.parse('icon', parseCategoryIcon),
      color: reader.parse('color', parseCategoryColor),
      sortOrder: reader.integer('sortOrder', min: 0),
      isActive: reader.boolean('isActive'),
      createdAt: reader.parse('createdAt', parseWireInstant),
      updatedAt: reader.parse('updatedAt', parseWireInstant),
    );
  }
}

/// `CreateCategoryRequestSchema`. Omitting [parentId] is what makes the API
/// create a root; a child inherits its root's icon and colour at the call
/// site (see the legacy `createSubcategory`).
class CreateCategoryRequest {
  CreateCategoryRequest({
    required this.kind,
    required String name,
    required String icon,
    required String color,
    this.parentId,
    this.sortOrder,
  }) : name = parseCategoryName(name),
       icon = parseCategoryIcon(icon),
       color = parseCategoryColor(color) {
    if (sortOrder != null && sortOrder! < 0) {
      throw FormatException('sortOrder must be >= 0', '$sortOrder');
    }
  }

  final CategoryKind kind;
  final String name;
  final String icon;
  final String color;
  final String? parentId;
  final int? sortOrder;

  Map<String, Object?> toJson() => {
    'kind': kind.wire,
    'name': name,
    'icon': icon,
    'color': color,
    if (parentId != null) 'parentId': parentId,
    if (sortOrder != null) 'sortOrder': sortOrder,
  };
}

/// `UpdateCategoryRequestSchema`. Every field is optional and `parentId` is
/// additionally nullable, so it uses [Patch] to keep "leave alone" and
/// "clear" distinguishable.
class UpdateCategoryRequest {
  UpdateCategoryRequest({
    String? name,
    String? icon,
    String? color,
    this.parentId = const Patch<String>.absent(),
    this.sortOrder,
    this.isActive,
  }) : name = name == null ? null : parseCategoryName(name),
       icon = icon == null ? null : parseCategoryIcon(icon),
       color = color == null ? null : parseCategoryColor(color) {
    if (sortOrder != null && sortOrder! < 0) {
      throw FormatException('sortOrder must be >= 0', '$sortOrder');
    }
  }

  final String? name;
  final String? icon;
  final String? color;
  final Patch<String> parentId;
  final int? sortOrder;
  final bool? isActive;

  Map<String, Object?> toJson() => {
    if (name != null) 'name': name,
    if (icon != null) 'icon': icon,
    if (color != null) 'color': color,
    if (parentId.isPresent) 'parentId': parentId.value,
    if (sortOrder != null) 'sortOrder': sortOrder,
    if (isActive != null) 'isActive': isActive,
  };
}

/// `CreateCategoryResponseSchema` / `UpdateCategoryResponseSchema`.
class CategoryResponse {
  const CategoryResponse({required this.category});

  final Category category;

  static CategoryResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return CategoryResponse(
      category: Category.fromJson(reader.raw('category')),
    );
  }
}

/// `ListCategoriesResponseSchema`.
class ListCategoriesResponse {
  const ListCategoriesResponse({required this.categories});

  final List<Category> categories;

  static ListCategoriesResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    return ListCategoriesResponse(
      categories: reader.list('categories', Category.fromJson),
    );
  }
}
