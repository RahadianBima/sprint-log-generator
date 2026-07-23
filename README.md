# Sprint Log Generator

App Next.js untuk generate Sprint Log ke Confluence secara otomatis dari data Jira.

## Features
- Atlassian OAuth 2.0 login
- Fetch active sprint goals & health from Jira
- AI mapping goals → tickets via Groq (Llama 3.3 70B)
- Sprint Health & Burndown chart
- Publish to Confluence with Space & Parent Page selector
- Caching: menyimpan hasil publish + duplicate prevention
- English UI (all text)

## Env Vars (Vercel)
JIRA_USER_EMAIL, JIRA_API_TOKEN, GROQ_API_KEY, JIRA_BASE_URL,
CONFLUENCE_SPACE_KEY, CONFLUENCE_PARENT_ID, ATLASSIAN_CLIENT_ID,
ATLASSIAN_CLIENT_SECRET, ATLASSIAN_REDIRECT_URI, JWT_SECRET

## Recent Changes
- Filter personal spaces (`?type=global`)
- Confluence v2 API pages (`/spaces/{id}/pages`) with pagination (20x250)
- Searchable combobox for Space & Parent Page
- Race condition fix with useRef counter
- English AI prompt + all UI text
- Cache sprint results in localStorage + duplicate warning
- Story → Task linkage with subtask display
