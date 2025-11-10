# Spec: Changes Required for Composite Value Operators and List Semantics

This doc lists only what must CHANGE in the current implementation to support:
- Value operators (composite value syntaxes) declared alongside accepted comparison operators
- Centralized collection handling (OR/AND with precedence) for ==/!= only
- Range/tolerance behavior and constraints
- Cardinality for fields
- Non-optional matches
- No default auto-matching inside the framework (defaults are utilities, called by handlers explicitly)

## 1) New FieldHandler surface: value operators and cardinality

Change FieldHandler to add:
- valueOps: readonly tuple of value operators, as const, e.g., opsv('[]', '..', '+', '-')
- cardinality?: 'single' | 'array' (default 'single')

Notes:
- valueOps operators:
  - '[]' → collection support inside [...]
  - '..' → range "a..b"
  - '+'  → tolerance upper side (used with '-')
  - '-'  → tolerance lower side (used with '+')
- matches remains required and receives MultiValue<T>, not collections (collections are reduced by framework).
- transformValue remains atomic (string -> T).

API change:
- Add a new helper `opsv()` that preserves tuple literal types for value operators.

Example:
- accepts.operators: ops('==','!=')
- valueOps: opsv('[]','..','+','-')
- cardinality: 'single'

## 2) MultiValue<T> union, Tolerance coerces to Range

Adjust MultiValue<T> to:
- Single<T> = { kind: 'single'; value: T }
- Range<T> = { kind: 'range'; lower: T; upper: T; inclusive?: boolean }
- MultiValue<T> = Single<T> | Range<T>

Tolerance:
- If '+' and/or '-' value operators are allowed, treat tolerance syntaxes as Range<T> by coercion:
  - Anchor ± Tol → derive lower and upper.
  - If only '+' or only '-' is present (e.g., “a+5”), treat as half-band relative to anchor:
    - '+' only: [anchor, anchor + tol]
    - '-' only: [anchor - tol, anchor]
  - If both present in the string in any order, build [anchor - tol, anchor + tol].
- This coercion requires arithmetic helpers (see Section 5).

## 3) Collection semantics centralized for == and != only

Framework must:
- Detect collections when valueOps includes '[]' and AST value is string[] (from tokenizer) or when raw string value is bracketed, if you support that form.
- Collections are only valid with == and !=. For other comparison operators with a collection, throw a parse error.
- Collection item separators inside []:
  - ',' and '|' are OR
  - '&' is AND
  - Precedence: AND > OR
- For single-valued fields (cardinality 'single'):
  - If '&' appears anywhere in the collection expression, throw error:
    “Single-value field 'X' cannot use the '&' operator. Cannot be two things at once.”
- Reduction algorithm:
  - Parse the Collection string[] into a boolean expression AST over raw item strings with AND/OR precedence.
  - For each leaf term:
    - transformValue(term) → T
    - Build Single<T>
    - Evaluate leaf by calling handler.matches(entity, op, Single<T>)
  - Reduce the boolean AST via AND/OR to produce a single boolean.
- The handler’s matches never sees collection structure; it only sees Single or Range. This is by design.

## 4) Value operator parsing rules (framework)

Given a KVP with string or string[] value:
- Check op is allowed (accepts.operators).
- collection handling:
  - If value is string[] and '[]' not in valueOps → parse error: collections not supported for this field.
  - If value is string[] and '[]' is allowed:
    - Enforce operator ∈ { '==', '!=' }; else error.
    - Reduce collection to boolean as in Section 3 and return result.
- Non-collection (single string) handling:
  - If '..' in valueOps and raw matches “a..b”:
    - Split into [a, b].
    - transformValue(a) and transformValue(b).
    - Create Range<T> { lower, upper, inclusive: true by default }.
    - Important: Only '==' and '!=' are valid when the value is Range. For '>', '>=', '<', '<=': throw parse error.
  - Else if '+' or '-' in valueOps and raw matches tolerance syntax:
    - Recognize:
      - 'anchor + tol'
      - 'anchor - tol'
      - 'anchor +/- tol' or 'anchor -/+ tol'
      - Any combination of '+' and '-' (e.g., '+-' or '-+')
    - transformValue(anchor), transformValue(tol)
    - Coerce to Range<T> using arithmetic helpers (Section 5)
    - Same operator restriction as range: only '==' and '!=' are valid; others error.
  - Else:
    - Single<T> via transformValue(raw)
  - Call handler.matches(entity, op, Single|Range).

## 5) Arithmetic helpers for tolerance coercion

Because transformValue returns T, the framework cannot assume numeric/date arithmetic.
Introduce optional arithmetic helpers that a field can expose when opting into '+'/'-':

- In FieldHandler, add an optional:
  - arith?: {
      add?: (a: T, b: T) => T;
      sub?: (a: T, b: T) => T;
    }

Rules:
- If the field declares '+' and/or '-' in valueOps, and a tolerance syntax is parsed, require the corresponding add/sub to be present; otherwise, throw (generic error, not ValueTransformError):
  “Field 'X' supports tolerance operators but does not provide required add/sub arithmetic.”

## 6) Operator restrictions with value types (framework-enforced)

- For values produced by Range<T> (from '..' or tolerance coercion), only '==' and '!=' are permitted. If a different comparison operator is used, throw:
  “Operator '<op>' is not supported with range values for field 'X'. Use '==' or '!='.”

- For collections (when '[]' is allowed), only '==' and '!=' are permitted. Enforce this when reducing the collection.

## 7) FieldRegistry typing: no widening of operators, keep variance safe

No change to the previously proposed fix except explicitly keep:
- FieldRegistry<TEntity> = Record<string, FieldHandler<TEntity, any, any>>
- ops helper as tuple-preserving generic

Add new opsv helper:
- opsv<const T extends readonly ValueOperator[]>(...o: T): T

Where:
- type ValueOperator = '[]' | '..' | '+' | '-'

## 8) Evaluator changes (only new/modified responsibilities)

- Before calling matches:
  - Enforce accepts.operators inclusion for op.
  - If value is a collection and '[]' not in valueOps → error.
  - If value is a collection and operator not in { '==','!=' } → error.
  - Reduce collections to boolean using transformValue + Single<T> + handler.matches + AND/OR precedence.
  - If single string:
    - Parse range if '..' in valueOps.
    - Parse tolerance if '+' or '-' in valueOps.
      - Coerce to Range<T> using handler.arith.add/sub; error if missing.
    - For resulting Range<T>, enforce operator in { '==','!=' }; else error.
    - For Single<T>, no special restriction (use accepts.operators for validation).
  - Call handler.matches(entity, op, Single|Range).
- Keep AND/OR/group AST evaluation unchanged outside of collection reduction logic.

## 9) Array field handling (TODO placeholder)

Do not implement now, but add clear TODOs:
- TODO: arrayFieldHandler utility to provide additional semantics for array fields:
  - arrayMatches() will mirror matches() but accept op:('any' | 'all' | 'none'), and a value: T[]
  - additional accepts.arrayOps: 'any' | 'all' | 'none'

## 10) Utility additions

- Add opsv (tuple-preserving value-ops builder):
  - export function opsv<const T extends readonly ValueOperator[]>(...o: T): T { return o; }
- Add a small parser for collection boolean expressions:
  - Tokenize items from a raw string[] representing the collection; treat raw items as terms; support operators '&' (AND), ',' and '|' (OR), with AND precedence > OR.
  - Build a minimal boolean AST and reduce by invoking matches on each term as Single<T>.
- Add tolerance parser recognizing '+', '-', '+/-', '±' tokens; normalize to an anchor + set of enabled signs; use transformValue for both anchor and tol; coerce to Range<T> via arith.

## 11) Handler obligations (enforced via valueOps and arith)

- If handler includes '+' or '-' in valueOps:
  - arith.add/sub must be present (if tolerance forms can arise). Try to work this into the typescript definitions

## 12) Errors (new)

- collections not allowed for this field.
- collections only allowed with '==' or '!='.
- AND ('&') not allowed for single-valued field 'X'.
- Range syntax '..' not supported for this field.
- Tolerance syntax not supported or missing arithmetic for field 'X'.
- Operator '<op>' not supported with range values. Allowed: '==', '!='.