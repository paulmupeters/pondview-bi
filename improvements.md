# `/analysis` Notebook Refactor Improvements

## Context

The old `/analysis` experience was simple and predictable:

- chat lived on the left
- visualization lived on the right
- clicking a chat selected the matching visualization

The refactor moved the page toward a notebook model, which is the right direction, but the current implementation still behaves like a single shared chat session with a shared footer composer and shared visualization state. As a result, the UI looks cell-based while the state model is still mostly global.

The target model should be:

- each notebook cell owns its own transcript
- each notebook cell owns its own visual result
- each notebook cell owns its own prompt input
- chat mode and manual SQL mode both operate on the same cell state
- adding a new cell should create a new independent analysis block, not just extend one shared footer flow

## Desired Cell Structure

Each analysis cell should contain exactly these parts, in this order:

1. Collapsed agent transcript
2. Visual output for that cell
3. Prompt input for that cell with `Chat` and `Manual SQL` modes

The transcript should contain assistant messages and tool calls for that cell only. The visual should render the committed data/chart result for that same cell. The prompt input should be the only place where the user edits prompts or SQL for that cell.

This means the old "select message -> show matching visual somewhere else" interaction is replaced by a stronger local ownership model: each cell already contains the correct visual directly under its own transcript.

## Problems To Fix

### 1. Tool calls are too noisy

Current problem:

- tool calls are exposed too aggressively
- long runs create a lot of UI noise
- the transcript competes with the actual visual result

Desired behavior:

- while the assistant is running, show only the latest tool call
- when the assistant finishes, collapse the transcript by default
- after completion, provide a clear affordance to expand and inspect the full transcript/tool-call history
- on errors, the transcript can auto-open so the failure is visible

Why this matters:

- the visual result is the primary output
- tool calls are supporting diagnostics, not the main interface
- notebook cells should scan like results-first blocks, not raw agent traces

Acceptance criteria:

- at most one live tool call is visible during execution
- completed cells default to a compact transcript state
- the user can expand a completed cell to inspect all assistant messages and tool calls
- error cells still surface enough detail to debug

### 2. Prompt input must exist per cell

Current problem:

- `/analysis` still uses a shared footer composer
- the active cell is effectively "the last cell"
- prompt text, SQL draft, and result ownership are biased toward a global active state instead of true cell-local state

Desired behavior:

- every cell has its own prompt input under its visual
- the user can add more cells
- running chat in a cell updates that same cell
- switching to manual mode in a cell edits that same cell's SQL
- chat mode and manual SQL mode are two views over one cell state, not two separate systems

Why this matters:

- a notebook UI only works if every block is self-contained
- a shared footer makes it ambiguous which cell is being edited
- the current mental model is closer to "one conversation with snapshots" than "many independent notebook cells"

Acceptance criteria:

- each rendered cell has its own composer
- adding a cell creates a fresh empty block with transcript + visual area + input
- prompt draft, SQL draft, status, and result persist per cell
- editing or rerunning one cell does not overwrite another cell's draft or result

### 3. Remove `Edit SQL` from the current run summary

Current problem:

- the current run summary includes its own `Edit SQL` control and editor surface
- this duplicates the job of manual mode in the prompt input
- users now have two competing places to edit SQL

Desired behavior:

- the prompt input manual mode becomes the single canonical SQL editing surface
- the current `Run summary` SQL editor should be removed
- if a summary block remains, it should only summarize execution metadata

Why this matters:

- notebook cells need one obvious place to act
- duplicating SQL editing surfaces creates state drift and UX confusion
- chat mode should feed the manual editor, not bypass it

Acceptance criteria:

- no separate inline SQL editor exists inside the transcript/run-summary area
- manual SQL editing happens only in the cell prompt input
- chat-generated SQL drafts flow into the cell's manual editor

### 4. Manual SQL mode is broken because it has no real cell-local visual target

Current problem:

- manual SQL mode currently does not clearly update or show a result inside the cell
- this is likely tied to the fact that the visualization panel is still shared/global instead of cell-local
- manual execution and cell rendering are not tightly coupled

Desired behavior:

- each cell always has its own visualization area
- running SQL in manual mode updates that cell's visual immediately
- the result persists as that cell's latest committed output
- chart/table/card configuration stays attached to that cell's result payload

Why this matters:

- manual mode is supposed to be the refinement path after chat mode
- if manual mode cannot visibly update the same cell, the notebook workflow breaks
- users need confidence that editing SQL affects only the current cell

Acceptance criteria:

- running manual SQL in a cell updates the visual in that same cell
- the SQL result becomes the persisted payload for that cell
- rerunning manual SQL does not depend on a separate shared visualization panel
- manual mode can render table/chart/card using the cell's own result payload

## Expected Chat/Manual Flow

The intended cell workflow should be:

1. User writes a prompt in a cell using `Chat` mode.
2. Assistant uses tools to inspect schema and draft/refine SQL.
3. The latest SQL draft is written into that cell's manual SQL state.
4. The final SQL result commits the cell's visual output.
5. User can switch to `Manual SQL` mode in the same cell.
6. User edits the SQL and reruns it.
7. The same cell visual updates with the new result.

Important rule:

- `Chat` mode and `Manual SQL` mode are not separate result systems
- they are two interaction modes for the same underlying cell

## Current Architectural Mismatch

The current implementation appears to still center around shared state in these areas:

- `src/components/chat/index.tsx`
  - notebook mode still derives an `activeCell` from the last cell
  - the main `PromptInputWrapper` still lives in shared footer content
  - the main visualization payload is also rendered in shared footer content

- `src/components/chat/chat-message-thread.tsx`
  - cells are grouped for transcript display, but they are not yet full notebook cells with their own composer and visual

- `src/components/chat/generated-sql-block.tsx`
  - the transcript currently exposes a second SQL editing surface via `Run summary -> Edit SQL`

- `src/components/prompt-input-wrapper.tsx`
  - manual SQL mode exists, but it is still wired like a shared shell instead of a per-cell control surface

- `src/components/chat/hooks/use-manual-visualization.ts`
  - manual visualization logic is still modeled as one controller, which conflicts with a notebook where each cell needs independent result/config state

## Implementation Direction

The clean fix is to make the cell the primary UI/state unit.

That likely means:

- render a real notebook cell component instead of using transcript cells plus one shared footer
- move prompt/chat/manual controls into each cell
- move the cell visual into each cell
- store transcript expansion state per cell
- store manual SQL draft and manual visual state per cell
- reduce the transcript to a compact default with optional expansion
- remove duplicate SQL editing from the run summary/transcript area

## Definition Of Done

The refactor is complete when `/analysis` behaves like a real notebook:

- each cell is self-contained
- tool calls are compact by default
- the latest tool call is the only live tool detail shown during execution
- completed cells can expand to show the full transcript
- each cell has its own prompt input
- each cell supports both `Chat` and `Manual SQL`
- manual SQL visibly updates the same cell's result
- adding a new cell creates a new independent analysis block
