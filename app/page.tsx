'use client';
import { useState, useEffect, useRef } from 'react';

const PARENT_ID = '51160186939';
const JIRA_BASE = 'https://jurnal.atlassian.net';

const TEAM_CONFIG = {
  ATINV: { name: 'COS', boardId: 398 },
  ATPRO: { name: 'PRO', boardId: 399 },
  ATFIN: { name: 'FIN', boardId: 396 },
  ATIPM: { name: 'IPM', boardId: 397 },
  ATVAL: { name: 'VAL', boardId: 401 },
  JURTAX: { name: 'TAX', boardId: 405 },
};

const STATUS_COLOR = {
  achieved: { badge: '#36B37E' },
  'partially achieved': { badge: '#FF8B00' },
  'not achieved': { badge: '#FF5630' },
  invalid: { badge: '#97A0AF' },
};

// ── Jira API via Next.js backend (no CORS issues) ──────────────────
async function fetchActiveSprintViaProxy(boardId) {
  var res = await fetch('/api/jira?boardId=' + boardId);
  if (!res.ok) {
    var errData = await res.json();
    throw new Error(errData.error || 'Gagal mengambil data dari Jira Server');
  }
  var data = await res.json();
  return {
    sprintId: data.sprintId,
    sprintName: data.sprintName,
    goal: data.sprintGoalFromJira || '',
  };
}

async function fetchSprintIssues(sprintId) {
  var res = await fetch('/api/jira?action=issues&sprintId=' + sprintId);
  if (!res.ok) throw new Error('Gagal fetch issues');
  var data = await res.json();
  return data.issues || [];
}

async function fetchIssuesByJql(jql) {
  var res = await fetch('/api/jira?action=jql&jql=' + encodeURIComponent(jql));
  if (!res.ok) throw new Error('Gagal fetch issues via JQL');
  var data = await res.json();
  return data.issues || [];
}

async function fetchSprintReport(boardId, sprintId) {
  var res = await fetch('/api/jira?action=sprintReport&boardId=' + boardId + '&sprintId=' + sprintId);
  if (!res.ok) throw new Error('Gagal fetch sprint report');
  return res.json();
}

async function fetchConfluenceSpaces() {
  var res = await fetch('/api/confluence?action=spaces');
  if (!res.ok) return [];
  var data = await res.json();
  return data.spaces || [];
}

async function fetchConfluencePages(spaceKey) {
  var res = await fetch('/api/confluence?action=pages&spaceKey=' + spaceKey);
  if (!res.ok) {
    var err = await res.json().catch(function(){ return {error:'Unknown error'}; });
    throw new Error(err.error || 'Gagal fetch pages');
  }
  var data = await res.json();
  return { pages: data.pages || [], total: data.total || 0 };
}

// ── Anthropic API ──────────────────────────────────────────────────────────────
async function anthropic(system, user, maxTokens) {
  var res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: system,
      user: user,
      maxTokens: maxTokens || 2000,
    }),
  });
  if (!res.ok) throw new Error('Anthropic Error ' + res.status);
  return res.json();
}

async function anthropicJSON(systemPrompt, userPrompt) {
  var res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system: systemPrompt, user: userPrompt }),
  });

  if (!res.ok) {
    var txt = await res.text();
    throw new Error('AI Error: ' + txt);
  }

  var data = await res.json();

  try {
    var rawText = data.content[0].text;
    // Bersihin markdown code fence kalo ada
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(rawText);
  } catch (e) {
    throw new Error('Format balasan AI salah atau tidak bisa di-parse.');
  }
}

// ── Build Confluence HTML ──────────────────────────────────────────────────────
function escapeHTML(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function buildHTML(goals, sprintReport) {
  function col(s) {
    if (s === 'achieved') return 'green';
    if (s === 'partially achieved') return 'yellow';
    if (s === 'invalid') return 'neutral';
    return 'red';
  }
  var rows = goals
    .map(function (g, i) {
      return (
        '<tr><td><p>' +
        (i + 1) +
        '</p></td><td><p>' +
        g.text +
        '</p></td>' +
        '<td><p><span data-type="status" data-color="' +
        col(g.status) +
        '">' +
        g.status +
        '</span></p></td>' +
        '<td><p>' +
        (g.comment || '') +
        '</p></td></tr>'
      );
    })
    .join('');

  // Sprint Health
  var sr = sprintReport || {};
  var healthRows = '';
  if (sr.completedIssues !== undefined) {
    var completionPct = sr.totalSP > 0
      ? Math.round((sr.completedSP / sr.totalSP) * 100)
      : 0;
    var scopeChanges = (sr.addedKeys || []).length;
    var totalIssues = sr.completedIssues + sr.notCompletedIssues + sr.puntedIssues;

    healthRows =
      '<tr>' +
        '<td><p>Total Tickets</p></td>' +
        '<td><p>' + totalIssues + '</p></td>' +
      '</tr>' +
      '<tr>' +
        '<td><p>Selesai</p></td>' +
        '<td><p>' + sr.completedIssues + '</p></td>' +
      '</tr>' +
      '<tr>' +
        '<td><p>Belum Selesai</p></td>' +
        '<td><p>' + sr.notCompletedIssues + '</p></td>' +
      '</tr>' +
      '<tr>' +
        '<td><p>Punted / Dropped</p></td>' +
        '<td><p>' + sr.puntedIssues + '</p></td>' +
      '</tr>' +
      '<tr>' +
        '<td><p>Scope Changes (Added)</p></td>' +
        '<td><p>' + scopeChanges + '</p></td>' +
      '</tr>';
  }

  // Burndown bar
  var burndownBar = '';
  if (sr.totalSP > 0) {
    var pct = Math.round((sr.completedSP / sr.totalSP) * 100);
    var remainingSP = sr.totalSP - sr.completedSP;
    burndownBar =
      '<p><strong>Story Point Progress: ' + pct + '%</strong></p>' +
      '<table style="width:100%;border-collapse:collapse;border:none">' +
      '<tr>' +
      '<td style="background:#DFE1E6;border-radius:8px;padding:0;border:none;width:100%">' +
      '<div style="background:#36B37E;width:' + pct + '%;height:24px;border-radius:8px;min-width:4px"/>' +
      '</td>' +
      '</tr>' +
      '</table>' +
      '<table>' +
      '<tr><td><p><strong>Total SP</strong></p></td><td><p>' + sr.totalSP + '</p></td></tr>' +
      '<tr><td><p><strong>Completed SP</strong></p></td><td><p>' + sr.completedSP + '</p></td></tr>' +
      '<tr><td><p><strong>Remaining SP</strong></p></td><td><p>' + remainingSP + '</p></td></tr>' +
      '</table>';
  }

  if (sr.sprint) {
    healthRows +=
      '<tr>' +
        '<td><p>Sprint Dates</p></td>' +
        '<td><p>' + (sr.sprint.startDate || '').slice(0,10) + ' → ' + (sr.sprint.endDate || '').slice(0,10) + '</p></td>' +
      '</tr>' +
      '<tr>' +
        '<td><p>Days Elapsed</p></td>' +
        '<td><p>' + sr.sprint.daysCompleted + '/' + sr.sprint.totalDays + '</p></td>' +
      '</tr>';
  }

  return (
    '<p><em>Title format: [Team_Name] Sprint #N Report</em></p>' +
    '<h1>Productivity and Scope Change</h1>' +
    '<h2>Sprint Health</h2>' +
    (healthRows
      ? '<table><tbody>' + healthRows + '</tbody></table>'
      : '<p><em>Capture the Sprint Health gadget on respective team dashboard in Jira right before closing the sprint.</em></p>'
    ) +
    '<h2>Burn Down Chart</h2>' +
    (burndownBar || '<p><em>Capture the Burn Down Chart gadget on respective team dashboard in Jira right before closing the sprint.</em></p>') +
    '<h2>Reason</h2>' +
    '<ol>' +
    '<li><span data-type="status" data-color="blue">Priority change</span> - Business change priority, alignment delay</li>' +
    '<li><span data-type="status" data-color="yellow">scope change</span> - Scope changes (Requirement added, requirement change, etc)</li>' +
    '<li><span data-type="status" data-color="neutral">internal team</span> - Missed estimation, Unidentified complexity, Fast Tracks, Reprioritization</li>' +
    '<li><span data-type="status" data-color="red">external factor</span> - Any decision made by partner or third party outside Mekari control</li>' +
    '</ol>' +
    '<table><thead><tr>' +
    '<th><p><strong>No</strong></p></th><th><p><strong>Reason and Brief Explanation</strong></p></th>' +
    '<th><p><strong>Potential Impact</strong></p></th><th><p><strong>Category</strong></p></th>' +
    '</tr></thead><tbody>' +
    '<tr><td><p>1</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>' +
    '</tbody></table>' +
    '<hr />' +
    '<h1>Sprint Goal</h1>' +
    '<table><thead><tr>' +
    '<th><p><strong>No</strong></p></th><th><p><strong>Sprint Goal and Target</strong></p></th>' +
    '<th><p><strong>Status</strong></p></th><th><p><strong>Comment</strong></p></th>' +
    '</tr></thead><tbody>' +
    rows +
    '</tbody></table>' +
    '<h2>Tickets</h2>' +
    goals.map(function(g){
      return '<h3>' + escapeHTML(g.text) + '</h3><ul>' +
        (g.tickets || []).map(function(t){
          var st = '<li><strong>' + t.key + '</strong> ' + (t.issuetype || '') + ' — ' + (escapeHTML(t.summary || '').slice(0,80)) + ' [' + t.status + ']</li>';
          if (t.subtasks && t.subtasks.length > 0) {
            st += '<ul style="color:#5E6C84">' +
              t.subtasks.map(function(s){
                return '<li>' + s.key + ' — ' + (escapeHTML(s.summary || '').slice(0,60)) + ' [' + s.status + ']</li>';
              }).join('') +
            '</ul>';
          }
          return st;
        }).join('') +
      '</ul>';
    }).join('') +
    '<h2>Issues and Escalation</h2>' +
    '<table><thead><tr>' +
    '<th><p><strong>No</strong></p></th><th><p><strong>Issue/Situation</strong></p></th>' +
    '<th><p><strong>Action</strong></p></th><th><p><strong>Escalation</strong></p></th>' +
    '</tr></thead><tbody>' +
    '<tr><td><p>1</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>' +
    '<tr><td><p>2</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>' +
    '</tbody></table>'
  );
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function Spinner(props) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
      <div
        style={{
          width: 44,
          height: 44,
          margin: '0 auto 14px',
          border: '4px solid #E8F0FE',
          borderTop: '4px solid #0052CC',
          borderRadius: '50%',
          animation: '_sp .9s linear infinite',
        }}
      />
      <style>{'@keyframes _sp{to{transform:rotate(360deg)}}'}</style>
      <p style={{ color: '#6B778C', fontSize: 14, margin: 0 }}>{props.label}</p>
    </div>
  );
}

function Steps(props) {
  var list = [
    'Pilih Team',
    'Sprint Goals',
    'Fetch Tickets',
    'Review',
    'Selesai',
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {list.map(function (s, i) {
        var n = i + 1;
        var done = props.cur > n;
        var active = props.cur === n;
        return (
          <div
            key={n}
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: i < list.length - 1 ? 1 : 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: done ? '#0052CC' : active ? '#E8F0FE' : '#F4F5F7',
                  color: done ? '#fff' : active ? '#0052CC' : '#97A0AF',
                  border: active
                    ? '2px solid #0052CC'
                    : '2px solid transparent',
                }}
              >
                {done ? '✓' : n}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 400,
                  whiteSpace: 'nowrap',
                  color: active || done ? '#0052CC' : '#97A0AF',
                }}
              >
                {s}
              </span>
            </div>
            {i < list.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: done ? '#0052CC' : '#DFE1E6',
                  margin: '0 6px',
                  marginBottom: 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Card(props) {
  return (
    <div
      style={Object.assign(
        {
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #DFE1E6',
          padding: 24,
        },
        props.style
      )}
    >
      {props.children}
    </div>
  );
}

function Btn(props) {
  var bg = props.secondary ? '#fff' : props.disabled ? '#C1C7D0' : '#0052CC';
  var color = props.secondary ? '#6B778C' : '#fff';
  var border = props.secondary ? '1px solid #DFE1E6' : 'none';
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      style={{
        background: bg,
        color: color,
        border: border,
        borderRadius: 8,
        padding: '11px 20px',
        fontWeight: 700,
        fontSize: 14,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
    >
      {props.children}
    </button>
  );
}

function GoalCard(props) {
  var goal = props.goal;
  var index = props.index;
  var sc = STATUS_COLOR[goal.status] || STATUS_COLOR['not achieved'];
  return (
    <div
      style={{
        border: '1px solid #DFE1E6',
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 10,
        borderLeft: '4px solid ' + sc.badge,
        background: '#FAFBFC',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: '#172B4D',
          marginBottom: 10,
        }}
      >
        <span style={{ color: '#97A0AF', marginRight: 8 }}>{index + 1}.</span>
        {goal.text}
      </div>
      <div
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}
      >
        {Object.keys(STATUS_COLOR).map(function (s) {
          return (
            <button
              key={s}
              onClick={function () {
                props.onChange(index, 'status', s);
              }}
              style={{
                padding: '3px 10px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                background:
                  goal.status === s ? STATUS_COLOR[s].badge : '#F4F5F7',
                color: goal.status === s ? '#fff' : '#6B778C',
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
      <textarea
        value={goal.comment}
        onChange={function (e) {
          props.onChange(index, 'comment', e.target.value);
        }}
        placeholder="Comment untuk sprint review..."
        style={{
          width: '100%',
          minHeight: 56,
          border: '1px solid #DFE1E6',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 13,
          color: '#172B4D',
          resize: 'vertical',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          background: '#fff',
        }}
      />
      {goal.tickets && goal.tickets.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection:'column', gap: 4 }}>
          {goal.tickets.map(function (t) {
            var tbg =
              t.statusCategory === 'done'
                ? '#E3FCEF'
                : t.statusCategory === 'new'
                ? '#F4F5F7'
                : '#FFFAE6';
            var tc =
              t.statusCategory === 'done'
                ? '#006644'
                : t.statusCategory === 'new'
                ? '#6B778C'
                : '#974F0C';
            return (
              <div key={t.key} style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 500,
                    background: tbg,
                    color: tc,
                  }}
                >
                  {t.key} · {t.status} {t.issuetype ? '(' + t.issuetype + ')' : ''}
                </span>
                {t.subtasks && t.subtasks.length > 0 && (
                  <span style={{ fontSize:10, color:'#6B778C', display:'flex', gap:4, flexWrap:'wrap' }}>
                    →
                    {t.subtasks.map(function (s) {
                      var sbg = s.statusCategory === 'done' ? '#E3FCEF' : s.statusCategory === 'new' ? '#F4F5F7' : '#FFFAE6';
                      var sc = s.statusCategory === 'done' ? '#006644' : s.statusCategory === 'new' ? '#6B778C' : '#974F0C';
                      return (
                        <span key={s.key} style={{ fontSize:10, padding:'1px 6px', borderRadius:3, background:sbg, color:sc }}>
                          {s.key}
                        </span>
                      );
                    })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  var userState = useState(null);
  var user = userState[0];
  var setUser = userState[1];
  var authLoadingState = useState(true);
  var authLoading = authLoadingState[0];
  var setAuthLoading = authLoadingState[1];

  useEffect(function () {
    fetch('/api/auth/me')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { setUser(d); setAuthLoading(false); })
      .catch(function () { setUser(null); setAuthLoading(false); });
  }, []);

  var stepState = useState(1);
  var step = stepState[0];
  var setStep = stepState[1];
  var pkState = useState('ATPRO');
  var pk = pkState[0];
  var setPk = pkState[1];
  var sprintNameState = useState('');
  var sprintName = sprintNameState[0];
  var setSprintName = sprintNameState[1];
  var rawGoalsState = useState('');
  var rawGoals = rawGoalsState[0];
  var setRawGoals = rawGoalsState[1];
  var sprintIdState = useState(null);
  var sprintId = sprintIdState[0];
  var setSprintId = sprintIdState[1];
  var goalsState = useState([]);
  var goals = goalsState[0];
  var setGoals = goalsState[1];
  var sprintInfoState = useState(null);
  var sprintInfo = sprintInfoState[0];
  var setSprintInfo = sprintInfoState[1];
  var loadingState = useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];
  var loadingMsgState = useState('');
  var loadingMsg = loadingMsgState[0];
  var setLoadingMsg = loadingMsgState[1];
  var fetchingState = useState(false);
  var fetching = fetchingState[0];
  var setFetching = fetchingState[1];
  var goalsErrState = useState('');
  var goalsErr = goalsErrState[0];
  var setGoalsErr = goalsErrState[1];
  var errorState = useState('');
  var error = errorState[0];
  var setError = errorState[1];
  var createdUrlState = useState('');
  var createdUrl = createdUrlState[0];
  var setCreatedUrl = createdUrlState[1];
  var sprintReportState = useState(null);
  var sprintReport = sprintReportState[0];
  var setSprintReport = sprintReportState[1];
  var spacesState = useState([]);
  var spaces = spacesState[0];
  var setSpaces = spacesState[1];
  var selectedSpaceState = useState('PD');
  var selectedSpace = selectedSpaceState[0];
  var setSelectedSpace = selectedSpaceState[1];
  var pagesState = useState([]);
  var pages = pagesState[0];
  var setPages = pagesState[1];
  var pagesLoadingState = useState(false);
  var pagesLoading = pagesLoadingState[0];
  var setPagesLoading = pagesLoadingState[1];
  var pagesErrorState = useState('');
  var pagesError = pagesErrorState[0];
  var setPagesError = pagesErrorState[1];
  var pagesTotalState = useState(0);
  var pagesTotal = pagesTotalState[0];
  var setPagesTotal = pagesTotalState[1];
  var pagesSearchState = useState('');
  var pagesSearch = pagesSearchState[0];
  var setPagesSearch = pagesSearchState[1];
  var pagesOpenState = useState(false);
  var pagesOpen = pagesOpenState[0];
  var setPagesOpen = pagesOpenState[1];
  var spacesSearchState = useState('');
  var spacesSearch = spacesSearchState[0];
  var setSpacesSearch = spacesSearchState[1];
  var spacesOpenState = useState(false);
  var spacesOpen = spacesOpenState[0];
  var setSpacesOpen = spacesOpenState[1];
  var selectedParentState = useState('51160186939');
  var selectedParent = selectedParentState[0];
  var setSelectedParent = selectedParentState[1];

  var team = TEAM_CONFIG[pk];

  // Fetch Confluence spaces on mount
  useEffect(function () {
    fetchConfluenceSpaces().then(function (s) {
      setSpaces(s);
    });
  }, []);

  var fetchRef = useRef(0);

  // Fetch pages when space changes (for parent page selector)
  function doFetchPages(spaceKey) {
    if (!spaceKey) return;
    fetchRef.current++;
    var thisFetch = fetchRef.current;
    setPagesLoading(true);
    setPagesError('');
    setPages([]);
    setPagesTotal(0);
    fetchConfluencePages(spaceKey)
      .then(function (p) {
        if (thisFetch !== fetchRef.current) return;
        setPages(p.pages);
        setPagesTotal(p.total);
        setPagesLoading(false);
      })
      .catch(function (err) {
        if (thisFetch !== fetchRef.current) return;
        setPagesError(err.message);
        setPagesLoading(false);
      });
  }

  useEffect(function () {
    setPagesSearch('');
    doFetchPages(selectedSpace);
  }, [selectedSpace]);

  // Also refetch when entering step 4
  useEffect(function () {
    if (step !== 4) return;
    doFetchPages(selectedSpace);
  }, [step]);

  function handlePagesSearchInput(value) {
    setPagesSearch(value);
    setPagesOpen(true);
  }

  // Auto-fetch goals when entering step 2
  useEffect(
    function () {
      if (step !== 2) return;
      setRawGoals('');
      setSprintName('');
      setSprintId(null);
      setGoalsErr('');
      doFetchGoals(pk);
    },
    [step, pk]
  );

  function doFetchGoals(projectKey) {
    var cfg = TEAM_CONFIG[projectKey];
    setFetching(true);
    setGoalsErr('');
    fetchActiveSprintViaProxy(cfg.boardId)
      .then(function (sprint) {
        setSprintName(sprint.sprintName || '');
        setSprintId(sprint.sprintId || null);
        var goalText = (sprint.goal || '').trim();
        setRawGoals(goalText);
        if (!goalText)
          setGoalsErr(
            'Sprint goals belum diisi di Jira. Silakan isi manual di bawah.'
          );
        setFetching(false);
      })
      .catch(function (err) {
        setGoalsErr(
          'Gagal fetch sprint goal: ' + err.message + '. Silakan isi manual.'
        );
        setFetching(false);
      });
  }

  function parseLines(raw) {
    return (raw || '')
      .split('\n')
      .map(function (l) {
        return l
          .replace(/^\s*\d+[.)]\s*/, '')
          .replace(/→/g, '-')
          .trim();
      })
      .filter(function (l) {
        return l.length > 3;
      });
  }

  function doFetchAndMap() {
    var lines = parseLines(rawGoals);
    if (!lines.length) {
      setError('Minimal isi 1 sprint goal.');
      return;
    }
    if (!sprintName.trim()) {
      setError('Nama sprint tidak boleh kosong.');
      return;
    }
    setError('');
    setLoading(true);
    setStep(3);

    var issuesPromise;
    if (sprintId) {
      setLoadingMsg('Mengambil tickets dari Jira Agile API...');
      issuesPromise = fetchSprintIssues(sprintId);
    } else {
      setLoadingMsg('Mencari tickets via JQL...');
      issuesPromise = fetchIssuesByJql('project = ' + pk + ' AND sprint = "' + sprintName + '"');
    }

    issuesPromise
      .then(function (issues) {
        setLoadingMsg(issues.length + ' tickets. Mapping ke sprint goals...');

        var ticketLines =
          issues
            .slice(0, 80)
            .map(function (t) {
              var parent = t.parentKey ? ' parent=' + t.parentKey : '';
              return (
                t.key +
                ' (' + t.issuetype + parent + '):[' +
                t.statusCategory +
                '] ' +
                (t.summary || '').slice(0, 55)
              );
            })
            .join('\n') || '(none)';

        var goalStr = lines
          .map(function (g, i) {
            return i + 1 + '. ' + g;
          })
          .join('\n');

        // Also fetch sprint report data for health/burndown
        var reportPromise = sprintId
          ? fetchSprintReport(TEAM_CONFIG[pk].boardId, sprintId).catch(function () { return null; })
          : Promise.resolve(null);

        return Promise.all([
          anthropicJSON(
            'Sprint analyst. Return ONLY minified JSON no whitespace no markdown.',
            'Goals:\n' +
              goalStr +
              '\nTickets (each has key, type=Story/Task/Subtask, parentKey):\n' +
              ticketLines +
              '\nFor each goal: find relevant ticketKeys (stories and their subtasks), derive status(achieved/partially achieved/not achieved/invalid), 1-sentence English comment.' +
              '\nReturn: {"goals":[{"text":"...","status":"...","ticketKeys":["' +
              pk +
              '-1"],"comment":"..."}]}'
          ),
          reportPromise,
        ]).then(function (results) {
          var mp = results[0];
          var report = results[1];
          var imap = {};
          issues.forEach(function (t) {
            imap[t.key] = t;
          });
          var enriched = (
            mp.goals ||
            lines.map(function (g) {
              return {
                text: g,
                status: 'not achieved',
                ticketKeys: [],
                comment: '',
              };
            })
          ).map(function (g) {
            return {
              text: g.text,
              status: g.status || 'not achieved',
              comment: g.comment || '',
              tickets: (g.ticketKeys || [])
                .map(function (k) {
                  return imap[k];
                })
                .filter(Boolean),
            };
          });
          setGoals(enriched);
          setSprintInfo({ name: sprintName.trim(), team: team.name });
          setSprintReport(report);
          setStep(4);
          setLoading(false);
        });
      })
      .catch(function (err) {
        setError('Gagal: ' + err.message);
        setStep(2);
        setLoading(false);
      });
  }

  function doCreatePage() {
    setLoading(true);
    setLoadingMsg('Membuat halaman di Confluence...');
    var num = (sprintInfo.name.match(/\d+/) || ['N'])[0];
    var title = sprintInfo.team + ' - ' + num + ' Sprint Log';
    var body = buildHTML(goals, sprintReport);

    fetch('/api/confluence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, body: body, spaceKey: selectedSpace, parentId: selectedParent }),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Gagal'); });
        return res.json();
      })
      .then(function (result) {
        setCreatedUrl(result.pageUrl);
        setStep(5);
        setLoading(false);
        // Cache the result
        try {
          var cache = JSON.parse(localStorage.getItem('sprint_cache') || '{}');
          cache[sprintId] = { url: result.pageUrl, title: title, sprintName: sprintInfo.name, team: sprintInfo.team, createdAt: new Date().toISOString() };
          localStorage.setItem('sprint_cache', JSON.stringify(cache));
        } catch (e) {}
      })
      .catch(function (err) {
        setError('Gagal buat halaman: ' + err.message);
        setLoading(false);
      });
  }

  function chg(i, f, v) {
    setGoals(function (prev) {
      return prev.map(function (g, j) {
        return j === i ? Object.assign({}, g, { [f]: v }) : g;
      });
    });
  }

  function reset() {
    setStep(1);
    setGoals([]);
    setSprintInfo(null);
    setCreatedUrl('');
    setError('');
    setSprintName('');
    setRawGoals('');
    setSprintId(null);
    setSprintReport(null);
    setSelectedSpace('PD');
    setSelectedParent('51160186939');
  }

  if (authLoading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F4F5F7', fontFamily:'Inter,-apple-system,sans-serif' }}>
        <Spinner label="Memeriksa sesi..." />
      </div>
    );
  }

  if (!user || !user.authenticated) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F4F5F7', fontFamily:'Inter,-apple-system,sans-serif' }}>
        <div style={{ textAlign:'center', maxWidth:400 }}>
          <div style={{ textAlign:'right', marginBottom:16 }}>
            {user === null ? '' : <a href="/api/auth/logout" style={{ fontSize:12, color:'#97A0AF', textDecoration:'none' }}>Logout</a>}
          </div>
          <h1 style={{ color:'#172B4D', fontSize:28, margin:'0 0 8px' }}>Sprint Log Generator</h1>
          <p style={{ color:'#6B778C', fontSize:14, margin:'0 0 24px', lineHeight:1.5 }}>
            Generate sprint log ke Confluence secara otomatis.
          </p>
          <a
            href="/api/auth/login"
            style={{
              display:'inline-block', padding:'12px 32px', background:'#0052CC', color:'#fff',
              borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:14,
            }}
          >
            Login dengan Atlassian
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F4F5F7',
        fontFamily: 'Inter,-apple-system,sans-serif',
        padding: '28px 16px',
      }}
    >
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#0052CC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            📋
          </div>
          <div style={{ flex: 1 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: '#172B4D',
              }}
            >
              Sprint Log Generator
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#6B778C' }}>
              Auto-generate Sprint Log Confluence · A&T Tribe
            </p>
          </div>
          <a
            href="/api/auth/logout"
            style={{
              fontSize: 12,
              color: '#97A0AF',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Logout
          </a>
        </div>

        <Steps cur={step} />

        {error && (
          <div
            style={{
              background: '#FFEBE6',
              border: '1px solid #FFBDAD',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              color: '#BF2600',
              fontSize: 13,
              display: 'flex',
              gap: 8,
            }}
          >
            <span>⚠️</span>
            <span style={{ wordBreak: 'break-word' }}>{error}</span>
          </div>
        )}

        {step === 1 && (
          <Card>
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 15,
                fontWeight: 700,
                color: '#172B4D',
              }}
            >
              Pilih Team
            </h2>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 24,
              }}
            >
              {Object.entries(TEAM_CONFIG).map(function (entry) {
                var k = entry[0];
                var c = entry[1];
                return (
                  <button
                    key={k}
                    onClick={function () {
                      setPk(k);
                    }}
                    style={{
                      padding: '9px 22px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: '2px solid',
                      fontWeight: 600,
                      fontSize: 14,
                      borderColor: pk === k ? '#0052CC' : '#DFE1E6',
                      background: pk === k ? '#E8F0FE' : '#fff',
                      color: pk === k ? '#0052CC' : '#6B778C',
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <Btn
              onClick={function () {
                setError('');
                setStep(2);
              }}
            >
              Lanjut - Fetch Sprint Goals
            </Btn>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: '0 0 4px',
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#172B4D',
                  }}
                >
                  Sprint Goals — {team.name} Team
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6B778C' }}>
                  Data otomatis diambil dari sprint aktif di Jira.
                </p>
              </div>
              <button
                onClick={function () {
                  doFetchGoals(pk);
                }}
                disabled={fetching}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid #DFE1E6',
                  background: '#fff',
                  color: '#0052CC',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {fetching ? 'Loading...' : '🔄 Refresh'}
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#172B4D',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Sprint Aktif
              </label>
              {fetching ? (
                <div
                  style={{
                    background: '#F4F5F7',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#97A0AF',
                  }}
                >
                  Mengambil data sprint...
                </div>
              ) : (
                <input
                  value={sprintName}
                  onChange={function (e) {
                    setSprintName(e.target.value);
                  }}
                  placeholder="contoh: PRO Sprint #62"
                  style={{
                    width: '100%',
                    border: '1px solid #DFE1E6',
                    borderRadius: 6,
                    padding: '9px 12px',
                    fontSize: 14,
                    color: '#172B4D',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <label
                  style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}
                >
                  Sprint Goals
                </label>
                {!fetching && rawGoals && (
                  <span
                    style={{
                      fontSize: 11,
                      background: '#E3FCEF',
                      color: '#006644',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontWeight: 600,
                    }}
                  >
                    ✓ Auto-filled dari Jira
                  </span>
                )}
                {!fetching && !rawGoals && (
                  <span
                    style={{
                      fontSize: 11,
                      background: '#FFFAE6',
                      color: '#974F0C',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontWeight: 600,
                    }}
                  >
                    Isi manual
                  </span>
                )}
              </div>
              {fetching ? (
                <div
                  style={{
                    background: '#F4F5F7',
                    borderRadius: 6,
                    padding: '40px 12px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      margin: '0 auto 10px',
                      border: '3px solid #E8F0FE',
                      borderTop: '3px solid #0052CC',
                      borderRadius: '50%',
                      animation: '_sp .9s linear infinite',
                    }}
                  />
                  <p style={{ color: '#6B778C', fontSize: 13, margin: 0 }}>
                    Mengambil sprint goals dari Jira...
                  </p>
                </div>
              ) : (
                <textarea
                  value={rawGoals}
                  onChange={function (e) {
                    setRawGoals(e.target.value);
                  }}
                  placeholder={
                    '1. Goal pertama\n2. Goal kedua\n\n(Paste manual dari Jira Edit Sprint jika auto-fetch gagal)'
                  }
                  style={{
                    width: '100%',
                    minHeight: 200,
                    border: '1px solid #DFE1E6',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#172B4D',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>

            {goalsErr && (
              <div
                style={{
                  background: '#FFFAE6',
                  border: '1px solid #FFE380',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  color: '#974F0C',
                  marginBottom: 16,
                }}
              >
                ⚠️ {goalsErr}
              </div>
            )}
            {!goalsErr && rawGoals && !fetching && (
              <div
                style={{
                  background: '#E3FCEF',
                  border: '1px solid #ABF5D1',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  color: '#006644',
                  marginBottom: 16,
                }}
              >
                ✓ Sprint goals berhasil di-fetch dari Jira. Edit jika
                diperlukan.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Btn
                secondary
                onClick={function () {
                  setStep(1);
                }}
              >
                Ganti Team
              </Btn>
              <Btn
                onClick={doFetchAndMap}
                disabled={fetching || !sprintName.trim() || !rawGoals.trim()}
              >
                Fetch Tickets dan Auto-Map
              </Btn>
            </div>
          </Card>
        )}

        {step === 3 && loading && (
          <Card>
            <Spinner label={loadingMsg} />
          </Card>
        )}

        {step === 4 && (
          <div>
            <Card style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#6B778C' }}>
                    Sprint aktif - {team.name} Team
                  </div>
                  <div
                    style={{ fontWeight: 700, color: '#172B4D', fontSize: 16 }}
                  >
                    {sprintInfo && sprintInfo.name}
                  </div>
                </div>
                <div
                  style={{
                    background: '#E3FCEF',
                    color: '#006644',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {goals.length} Goals
                </div>
              </div>
              {sprintId && (function(){
                var cache;
                try { cache = JSON.parse(localStorage.getItem('sprint_cache') || '{}'); } catch(e) { cache = {}; }
                var existing = cache[sprintId];
                if (!existing) return null;
                return (
                  <div style={{ marginTop:10, padding:'8px 12px', background:'#FFF0B3', borderRadius:6, fontSize:12, color:'#172B4D' }}>
                    ⚠ Sprint ini sudah pernah dipublikasikan:{' '}
                    <a href={existing.url} target="_blank" rel="noopener noreferrer" style={{ color:'#0052CC', textDecoration:'underline' }}>{existing.title}</a>
                    {' '}— {new Date(existing.createdAt).toLocaleDateString()}
                  </div>
                );
              })()}
            </Card>
            <Card style={{ marginBottom: 14 }}>
              <h3 style={{ margin:'0 0 10px', fontSize:14, fontWeight:700, color:'#172B4D' }}>
                Confluence Destination
              </h3>
              <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                <div style={{ flex:1, position:'relative' }}>
                  <label style={{ fontSize:11, color:'#6B778C', display:'block', marginBottom:4 }}>Space</label>
                  <div>
                    <input
                      value={spacesOpen ? spacesSearch : ((spaces.find(function(s){ return s.key === selectedSpace; }) || {}).key || selectedSpace) + ' - ' + ((spaces.find(function(s){ return s.key === selectedSpace; }) || {}).name || '')}
                      onChange={function(e){ setSpacesSearch(e.target.value); setSpacesOpen(true); }}
                      onFocus={function(){ setSpacesOpen(true); }}
                      onBlur={function(){ setTimeout(function(){ setSpacesOpen(false); }, 150); }}
                      placeholder="Search space..."
                      style={{
                        width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid #DFE1E6',
                        fontSize:13, color:'#172B4D', boxSizing:'border-box',
                      }}
                    />
                    {spacesOpen && (
                      <div style={{
                        position:'absolute', top:'100%', left:0, right:0, maxHeight:220, overflowY:'auto',
                        background:'#fff', border:'1px solid #DFE1E6', borderRadius:6, marginTop:2,
                        zIndex:10, boxShadow:'0 4px 12px rgba(0,0,0,0.1)',
                      }}>
                        {spaces.filter(function(s){ return (s.key + ' ' + s.name).toLowerCase().indexOf(spacesSearch.toLowerCase()) !== -1; }).length === 0 ? (
                          <div style={{ padding:'10px 12px', fontSize:12, color:'#97A0AF' }}>No spaces found</div>
                        ) : (
                          spaces.filter(function(s){ return (s.key + ' ' + s.name).toLowerCase().indexOf(spacesSearch.toLowerCase()) !== -1; }).map(function(s){
                            var sel = s.key === selectedSpace;
                            return (
                              <div key={s.key}
                                onClick={function(){ setSelectedSpace(s.key); setSpacesOpen(false); setSpacesSearch(''); doFetchPages(s.key); }}
                                style={{
                                  padding:'8px 12px', fontSize:13, cursor:'pointer',
                                  background: sel ? '#E8F0FE' : '#fff', color: sel ? '#0052CC' : '#172B4D',
                                  fontWeight: sel ? 600 : 400,
                                  borderBottom:'1px solid #F4F5F7',
                                }}
                              >{s.key} - {s.name}</div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ flex:1, position:'relative' }}>
                  <label style={{ fontSize:11, color:'#6B778C', display:'block', marginBottom:4 }}>Parent Page</label>
                  <div>
                    <input
                      value={pagesLoading ? 'Loading...' : (pagesOpen ? pagesSearch : (pages.find(function(p){ return p.id === selectedParent; }) || {}).title || '')}
                      onChange={function(e){ handlePagesSearchInput(e.target.value); }}
                      onFocus={function(){ setPagesOpen(true); }}
                      onBlur={function(){ setTimeout(function(){ setPagesOpen(false); }, 150); }}
                      placeholder="Search page..."
                      style={{
                        width:'100%', padding:'8px 10px', borderRadius:6, border:'1px solid #DFE1E6',
                        fontSize:13, color:'#172B4D', boxSizing:'border-box',
                      }}
                    />
                    {pagesOpen && (
                      <div style={{
                        position:'absolute', top:'100%', left:0, right:0, maxHeight:220, overflowY:'auto',
                        background:'#fff', border:'1px solid #DFE1E6', borderRadius:6, marginTop:2,
                        zIndex:10, boxShadow:'0 4px 12px rgba(0,0,0,0.1)',
                      }}>
                        {pagesLoading ? (
                          <div style={{ padding:'10px 12px', fontSize:12, color:'#97A0AF' }}>Loading...</div>
                        ) : pagesError ? (
                          <div style={{ padding:'10px 12px', fontSize:12, color:'#BF2600' }}>Error: {pagesError}</div>
                        ) : pages.filter(function(p){ return !pagesSearch || p.title.toLowerCase().indexOf(pagesSearch.toLowerCase()) !== -1; }).length === 0 ? (
                          <div style={{ padding:'10px 12px', fontSize:12, color:'#97A0AF' }}>No pages found</div>
                        ) : (
                          <>
                          <div style={{ padding:'6px 12px', fontSize:11, color:'#6B778C', borderBottom:'1px solid #F4F5F7' }}>{pages.filter(function(p){ return !pagesSearch || p.title.toLowerCase().indexOf(pagesSearch.toLowerCase()) !== -1; }).length} pages (total: {pagesTotal})</div>
                          {pages.filter(function(p){ return !pagesSearch || p.title.toLowerCase().indexOf(pagesSearch.toLowerCase()) !== -1; }).map(function(p){
                            var sel = p.id === selectedParent;
                            return (
                              <div key={p.id}
                                onClick={function(){ setSelectedParent(p.id); setPagesOpen(false); setPagesSearch(''); }}
                                style={{
                                  padding:'8px 12px', fontSize:13, cursor:'pointer',
                                  background: sel ? '#E8F0FE' : '#fff', color: sel ? '#0052CC' : '#172B4D',
                                  fontWeight: sel ? 600 : 400,
                                  borderBottom:'1px solid #F4F5F7',
                                }}
                              >{p.title}</div>
                            );
                          })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
            <Card style={{ marginBottom: 14 }}>
              <h3
                style={{
                  margin: '0 0 6px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#172B4D',
                }}
              >
                Review dan Edit Sprint Goals
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B778C' }}>
                Status di-derive dari ticket progress. PM/EM bisa adjust sebelum
                dibuat ke Confluence.
              </p>
              {goals.map(function (g, i) {
                return <GoalCard key={i} goal={g} index={i} onChange={chg} />;
              })}
            </Card>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn
                secondary
                onClick={function () {
                  setStep(2);
                }}
              >
                Edit Goals
              </Btn>
              <Btn onClick={doCreatePage} disabled={loading}>
                {loading ? 'Membuat...' : 'Buat di Confluence'}
              </Btn>
            </div>
          </div>
        )}

        {step === 5 && (
          <Card style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 18,
                fontWeight: 700,
                color: '#172B4D',
              }}
            >
              Sprint Log berhasil dibuat!
            </h2>
            <p style={{ margin: '0 0 24px', color: '#6B778C', fontSize: 14 }}>
              Dokumen sudah ada di Confluence. PM/EM tinggal lengkapi Sprint
              Health, Burn Down Chart, dan comment saat sprint review.
            </p>
            <a
              href={createdUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '12px 32px',
                background: '#0052CC',
                color: '#fff',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 15,
                marginBottom: 16,
              }}
            >
              Buka di Confluence
            </a>
            <div>
              <button
                onClick={reset}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #DFE1E6',
                  borderRadius: 8,
                  background: '#fff',
                  color: '#6B778C',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Generate Sprint Log lagi
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
