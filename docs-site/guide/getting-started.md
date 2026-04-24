# Getting Started

This guide is for people who want to start using BI Chat quickly.

You do not need to learn the technical architecture first. The fastest path is:

1. Connect your data
2. Set up your AI provider
3. Ask a question in chat
4. Refine the result in manual mode if needed
5. Turn useful visuals into a dashboard

## Before you start

You will need:

- Access to the BI Chat app
- A dataset to connect or upload
- An API key for the AI provider you want to use

If you are running BI Chat locally, follow the repository setup instructions in the project README first, then return here for the product walkthrough.

## 1) Connect your data

Start by adding the data you want to analyze.

You can either:

- Connect a data source such as DuckDB, MotherDuck, Postgres, MySQL, or SQLite
- Upload a file such as CSV, Parquet, XLSX, or XLS

Once your data is connected, you should be able to browse available tables in the app and use them in analysis.

Read more:

- [Connected Data Sources](/introduction/connected-data-sources)
- [Uploads and Browser Storage](/introduction/uploads-and-browser-storage)

## 2) Set up your AI provider

Next, configure the AI model BI Chat should use.

In the app:

1. Open **Settings**
2. Choose your AI provider
3. Enter the model you want to use
4. Add your API key
5. Save your settings

After that, return to chat.

Read more:

- [AI Provider Configuration](/introduction/ai-provider-configuration)

## 3) Create your first analysis in chat

Now you are ready to ask a question.

Try a prompt like:

- "What were my top 10 products by revenue last month?"
- "Show monthly sales trends by region"
- "Which categories are growing fastest this quarter?"

BI Chat can help generate the analysis for you and show the result as a table or visualization.

A good first workflow is:

1. Ask a business question in chat
2. Review the returned result
3. Check whether the result answers your question
4. Keep iterating with follow-up questions until it does

## 4) Switch from chat mode to manual mode when you want more control

You do not have to stay in chat mode the whole time.

If you want to inspect or refine the result yourself, use the mode switch in the prompt area to move from **chat/AI mode** to **manual mode**. Manual mode is useful when you want to work more directly with the generated analysis, adjust the query, or fine-tune the output before saving it.

A simple pattern is:

1. Start in chat mode to generate the first analysis
2. Switch to manual mode to refine it
3. Adjust the result until it looks right
4. Continue from there with a chart, card, or table

If you are not getting the exact result you want from chat alone, this is usually the fastest way to take control.

## 5) Tweak the visual

After you have a useful result, you can change how it is displayed.

Depending on the result, you can usually work with it as a:

- Table
- Chart
- Card

Use this step to make the output easier to read and share. For example, you might switch from a table to a chart, or simplify a single-value result into a card.

## 6) Create a dashboard from chat

When you have a result worth keeping, you can turn it into a dashboard workflow.

A typical flow is:

1. Create an analysis in chat
2. Refine it in manual mode if needed
3. Choose the visual you want
4. Add that visual to a dashboard
5. Open the dashboard and continue organizing your views

This makes it easy to go from exploration to something you can revisit and share inside your workspace.

Read more:

- [Dashboards](/guide/dashboards)

## A quick first-run path

If you want the shortest possible path, do this:

1. Connect a data source or upload a file
2. Configure your AI provider in **Settings**
3. Open chat and ask a question about your data
4. Switch to manual mode if you want to refine the result
5. Tweak the visual
6. Add it to a dashboard

## If something is not working

Common issues include:

- Missing or invalid AI provider settings
- Data source connected but tables are not available as expected
- Results are not running against the backend you expected

Helpful guides:

- [AI Provider Configuration](/introduction/ai-provider-configuration)
- [Connected Data Sources](/introduction/connected-data-sources)
- [SQL Runtime Backends](/introduction/sql-runtime-backends)

## Next steps

Once you have completed your first analysis, continue with:

- [Connected Data Sources](/introduction/connected-data-sources)
- [Uploads and Browser Storage](/introduction/uploads-and-browser-storage)
- [Dashboards](/guide/dashboards)
- [Workspace Persistence](/introduction/workspace-persistence)
- [Docs Map](/guide/)
