# Dashboards

Dashboards help you turn one-off analysis into something you can revisit, organize, and share inside your workspace.

This guide focuses on the user workflow: how to go from a useful chat result to a dashboard you can keep building on.

## What a dashboard is for

Use dashboards when you want to:

- Save charts, cards, and analysis results you want to come back to
- Organize multiple visuals in one place
- Track key metrics over time
- Build a view that is easier to scan than a chat history

A good rule of thumb is:

- Use **chat** for exploration
- Use the **SQL panel** for refinement
- Use **dashboards** for the results you want to keep

## The fastest way to create a dashboard

The most common flow looks like this:

1. Connect or upload data
2. Set up your AI provider
3. Ask a question in chat
4. Review the result
5. Edit the SQL if you want more control
6. Tweak the visual so it looks the way you want
7. Add it to a dashboard

If you have not done the earlier setup yet, start with [Getting Started](/guide/getting-started).

## Start from chat

Most dashboards begin with a question in chat.

For example:

- "Show revenue by month"
- "What are my top customers this quarter?"
- "Compare sales by region"
- "What changed most this week?"

Start broad, then refine. Once Pondview gives you a result that is useful, you can decide whether to keep it as-is or adjust it before saving it.

## Edit the SQL to refine the result

Chat is usually the quickest way to get to a first answer, but it does not need to be the final one.

Every analysis cell includes a SQL panel next to the result. Expand it to view, edit, and rerun the query whenever you want more control.

Editing the SQL is helpful when you want to:

- Refine the generated analysis
- Adjust the result before saving it
- Choose a better visual for the data
- Inspect the output more directly

A practical workflow is:

1. Ask the question in chat
2. Review the response
3. Open the SQL panel and edit the query
4. Make the result clearer or more focused
5. Save the final visual to a dashboard

## Choose the right visual

Before adding something to a dashboard, make sure the visual matches the question you are answering.

Common choices:

- **Table** for detailed results or comparisons across many rows
- **Chart** for trends, categories, and changes over time
- **Card** for a single KPI or headline number

If the first visual is not clear enough, tweak it before saving. This is usually worth doing so your dashboard is easier to understand later.

## Refine visuals

After chat returns a result, switch to the **Visual** tab on the analysis cell to see the chart Pondview picked for your data. If you want more control over how it looks, click **Visual options** in the header.

That opens a side panel where you can adjust the chart without rewriting the SQL. Common changes include:

- **Chart type** — line, bar, area, or pie
- **Axes** — which columns map to the X and Y axes
- **Color** — pick a series color from the theme palette
- **Display toggles** — legend, grid, dots, tooltip, and related chart details

Changes apply live as you edit, so you can compare options before saving the visual to a dashboard. Use **Visual options** when the underlying query is right but the presentation needs work — for example, turning a bar chart into a line chart for a time series, or swapping which column drives the Y axis.

**Visual options** is available for charts on the **Visual** tab. For tables, use the **Data** tab to review the raw result. For KPI cards, edit the title and description directly on the card.

## Add a visual to a dashboard

Once you have a result you want to keep, add it to a dashboard.

Typical examples include:

- A monthly revenue trend chart
- A top products table
- A single KPI card such as total revenue, active users, or conversion rate

Over time, you can combine these into a dashboard that answers a broader business question, such as:

- How is the business performing this month?
- Where are we seeing growth?
- Which segments need attention?



## Related guides

- [Getting Started](/guide/getting-started)
- [Connected Data Sources](/guide/connected-data-sources)
- [Uploads and Browser Storage](/guide/uploads-and-browser-storage)
- [AI Provider Configuration](/guide/ai-provider-configuration)
