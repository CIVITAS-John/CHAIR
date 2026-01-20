# Claude Code Guidelines for LLM-Qualitative

## TypeScript Best Practices

### Import Type Syntax

**NEVER** use inline `import()` type syntax in parameter or variable declarations:

```typescript
// ❌ WRONG - Don't do this
function foo(params?: import("./types.js").SomeType) {
    // ...
}

// ✅ CORRECT - Import at the top of the file
import type { SomeType } from "./types.js";

function foo(params?: SomeType) {
    // ...
}
```

**Reason**: Inline `import()` syntax:
- Makes code harder to read and maintain
- Breaks IDE navigation and refactoring tools
- Creates unnecessary coupling in type annotations
- Violates standard TypeScript conventions

Always import types explicitly at the top of the file using `import type` for better code organization and tooling support.
