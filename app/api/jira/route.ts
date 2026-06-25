import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'sprint';
    const baseUrl = process.env.JIRA_BASE_URL || 'https://jurnal.atlassian.net';
    const email = process.env.JIRA_USER_EMAIL || '';
    const token = process.env.JIRA_API_TOKEN || '';

    if (!email || !token) {
      return NextResponse.json(
        { error: 'JIRA_USER_EMAIL atau JIRA_API_TOKEN belum diisi di .env.local' },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

    const jiraFetch = async (url: string) => {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Jira ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json();
    }

    if (action === 'issues') {
      const sprintId = searchParams.get('sprintId');
      if (!sprintId) throw new Error('Parameter sprintId diperlukan');
      const fields = 'summary,status,customfield_10005,issuetype,parent,subtasks';
      const data = await jiraFetch(
        `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fields}&maxResults=100`
      );
      return NextResponse.json({
        issues: (data.issues || []).map((i: any) => ({
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status.name,
          statusCategory: i.fields.status.statusCategory?.key || 'new',
          storyPoints: i.fields.customfield_10005 || 0,
          issuetype: i.fields.issuetype?.name || '',
          parentKey: i.fields.parent?.key || null,
          subtasks: (i.fields.subtasks || []).map((s: any) => ({
            key: s.key,
            summary: s.fields?.summary || '',
            status: s.fields?.status?.name || '',
            statusCategory: s.fields?.status?.statusCategory?.key || 'new',
          })),
        })),
      });
    }

    if (action === 'jql') {
      const jql = searchParams.get('jql');
      if (!jql) throw new Error('Parameter jql diperlukan');
      const fields = 'summary,status,customfield_10005,issuetype,parent,subtasks';
      const data = await jiraFetch(
        `${baseUrl}/rest/agile/1.0/issue/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100`
      );
      return NextResponse.json({
        issues: (data.issues || []).map((i: any) => ({
          key: i.key,
          summary: i.fields.summary,
          status: i.fields.status.name,
          statusCategory: i.fields.status.statusCategory?.key || 'new',
          storyPoints: i.fields.customfield_10005 || 0,
          issuetype: i.fields.issuetype?.name || '',
          parentKey: i.fields.parent?.key || null,
          subtasks: (i.fields.subtasks || []).map((s: any) => ({
            key: s.key,
            summary: s.fields?.summary || '',
            status: s.fields?.status?.name || '',
            statusCategory: s.fields?.status?.statusCategory?.key || 'new',
          })),
        })),
      });
    }

    if (action === 'sprintReport') {
      const boardId = searchParams.get('boardId');
      const sprintId = searchParams.get('sprintId');
      if (!boardId || !sprintId) throw new Error('Parameter boardId dan sprintId diperlukan');

      const data = await jiraFetch(
        `${baseUrl}/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${sprintId}`
      );

      const contents = data.contents || {};
      return NextResponse.json({
        sprint: {
          name: data.sprint?.name || '',
          startDate: data.sprint?.isoStartDate || '',
          endDate: data.sprint?.isoEndDate || '',
          daysRemaining: data.sprint?.daysRemaining || 0,
          daysCompleted: data.sprint?.totalDays
            ? (data.sprint.totalDays - (data.sprint.daysRemaining || 0))
            : 0,
          totalDays: data.sprint?.totalDays || 0,
        },
        completedIssues: (contents.completedIssues || []).length,
        notCompletedIssues: (contents.issuesNotCompletedInCurrentSprint || []).length,
        puntedIssues: (contents.puntedIssues || []).length,
        completedInAnotherSprint: (contents.issuesCompletedInAnotherSprint || []).length,
        completedSP: contents.completedIssuesEstimateSum?.value || 0,
        totalSP: contents.allIssuesEstimateSum?.value || 0,
        notCompletedSP: contents.issuesNotCompletedEstimateSum?.value || 0,
        addedKeys: Object.keys(contents.issueKeysAddedDuringSprint || {}),
      });
    }

    // Default: get active sprint
    const boardId = searchParams.get('boardId') || '399';
    const sprintData = await jiraFetch(
      `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active`
    );
    const activeSprint = sprintData.values?.[0];
    if (!activeSprint) {
      return NextResponse.json(
        { error: `Tidak ada sprint aktif di board ${boardId}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sprintId: activeSprint.id,
      sprintName: activeSprint.name,
      sprintGoalFromJira: activeSprint.goal || '',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
