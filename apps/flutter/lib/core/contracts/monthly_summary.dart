import '../money/base_amount_pyg.dart';
import 'json_reader.dart';
import 'transactions.dart';

/// `CategoryBreakdownItemSchema`: per-root-category expense share.
/// `percentage` is not money (ADR 0001 only governs amounts and fx rates),
/// so it stays a number, rounded half-up to 2 decimals by the server.
class CategoryBreakdownItem {
  const CategoryBreakdownItem({
    required this.categoryId,
    required this.categoryName,
    required this.amount,
    required this.percentage,
  });

  final String categoryId;
  final String categoryName;
  final BaseAmountPyg amount;
  final double percentage;

  static CategoryBreakdownItem fromJson(Object? json) {
    final reader = JsonReader.object(json);
    final percentage = reader.number('percentage');
    if (percentage < 0 || percentage > 100) {
      throw ContractViolationException('percentage', 'expected 0..100');
    }
    return CategoryBreakdownItem(
      categoryId: reader.parse('categoryId', parseUuid),
      categoryName: reader.parse(
        'categoryName',
        (wire) => parseTrimmedText(wire, min: 1, max: 100),
      ),
      amount: reader.parse('amount', BaseAmountPyg.parseWire),
      percentage: percentage,
    );
  }
}

/// `BudgetSummarySchema`: M6 budget metrics. Percentages deliberately have
/// no upper bound — a projected budget can exceed 100% and the UI must show
/// the excess.
class BudgetSummary {
  const BudgetSummary({
    required this.totalLimitPyg,
    required this.allocatedPyg,
    required this.unallocatedPyg,
    required this.spentPyg,
    required this.availablePyg,
    required this.pendingCommitmentsPyg,
    required this.projectedAvailablePyg,
    required this.spentPercentage,
    required this.projectedPercentage,
  });

  final BaseAmountPyg totalLimitPyg;
  final BaseAmountPyg allocatedPyg;
  final BaseAmountPyg unallocatedPyg;
  final BaseAmountPyg spentPyg;
  final MonthlyBalancePyg availablePyg;
  final BaseAmountPyg pendingCommitmentsPyg;
  final MonthlyBalancePyg projectedAvailablePyg;
  final double spentPercentage;
  final double projectedPercentage;

  static BudgetSummary fromJson(Object? json) {
    final reader = JsonReader.object(json);
    final spentPercentage = reader.number('spentPercentage');
    final projectedPercentage = reader.number('projectedPercentage');
    if (spentPercentage < 0) {
      throw ContractViolationException('spentPercentage', 'expected >= 0');
    }
    if (projectedPercentage < 0) {
      throw ContractViolationException('projectedPercentage', 'expected >= 0');
    }
    return BudgetSummary(
      totalLimitPyg: reader.parse('totalLimitPyg', BaseAmountPyg.parseWire),
      allocatedPyg: reader.parse('allocatedPyg', BaseAmountPyg.parseWire),
      unallocatedPyg: reader.parse('unallocatedPyg', BaseAmountPyg.parseWire),
      spentPyg: reader.parse('spentPyg', BaseAmountPyg.parseWire),
      availablePyg: reader.parse('availablePyg', MonthlyBalancePyg.parseWire),
      pendingCommitmentsPyg: reader.parse(
        'pendingCommitmentsPyg',
        BaseAmountPyg.parseWire,
      ),
      projectedAvailablePyg: reader.parse(
        'projectedAvailablePyg',
        MonthlyBalancePyg.parseWire,
      ),
      spentPercentage: spentPercentage,
      projectedPercentage: projectedPercentage,
    );
  }
}

/// `MonthlySummaryResponseSchema`: a null `budget` means the month has no
/// budget yet — different from zero-valued metrics.
class MonthlySummaryResponse {
  const MonthlySummaryResponse({
    required this.balance,
    required this.incomeTotal,
    required this.expenseTotal,
    required this.categoryBreakdown,
    required this.recentTransactions,
    required this.budget,
  });

  final MonthlyBalancePyg balance;
  final BaseAmountPyg incomeTotal;
  final BaseAmountPyg expenseTotal;
  final List<CategoryBreakdownItem> categoryBreakdown;

  /// At most 4 items, per the contract's `.max(4)`.
  final List<Transaction> recentTransactions;
  final BudgetSummary? budget;

  static MonthlySummaryResponse fromJson(Object? json) {
    final reader = JsonReader.object(json);
    final recentTransactions = reader.list(
      'recentTransactions',
      Transaction.fromJson,
    );
    if (recentTransactions.length > 4) {
      throw ContractViolationException(
        'recentTransactions',
        'expected at most 4 items',
      );
    }
    final budgetJson = reader.raw('budget');
    return MonthlySummaryResponse(
      balance: reader.parse('balance', MonthlyBalancePyg.parseWire),
      incomeTotal: reader.parse('incomeTotal', BaseAmountPyg.parseWire),
      expenseTotal: reader.parse('expenseTotal', BaseAmountPyg.parseWire),
      categoryBreakdown: reader.list(
        'categoryBreakdown',
        CategoryBreakdownItem.fromJson,
      ),
      recentTransactions: recentTransactions,
      budget: budgetJson == null ? null : BudgetSummary.fromJson(budgetJson),
    );
  }
}
