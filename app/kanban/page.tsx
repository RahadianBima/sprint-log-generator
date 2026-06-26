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

const PRESET_LABELS = {
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

// ── Date helpers ────────────────────────────────────────────────────
function fmtDate(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getWeekNumber(d) {
  var start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 3 - ((start.getDay() + 6) % 7));
  var week1 = new Date(start.getFullYear(), 0, 4);
  var diff = (start.getTime() - week1.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getPeriodDates(preset) {
  var now = new Date();
  var day = now.getDay();
  var start, end, label;

  switch (preset) {
    case 'thisWeek': {
      var mon = new Date(now);
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      var sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      start = fmtDate(mon);
      end = fmtDate(sun);
      label = 'Week ' + getWeekNumber(mon) + ' ' + now.getFullYear();
      break;
    }
    case 'lastWeek': {
      var lmon = new Date(now);
      lmon.setDate(now.getDate() - (day === 0 ? 13 : day + 6));
      var lsun = new Date(lmon);
      lsun.setDate(lmon.getDate() + 6);
      start = fmtDate(lmon);
      end = fmtDate(lsun);
      label = 'Week ' + getWeekNumber(lmon) + ' ' + lmon.getFullYear();
      break;
    }
    case 'thisMonth': {
      start = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
      end = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      label = now.toLocaleString('en', { month: 'long' }) + ' ' + now.getFullYear();
      break;
    }
    case 'lastMonth': {
      start = fmtDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      end = fmtDate(new Date(now.getFullYear(), now.getMonth(), 0));
      label = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString('en', { month: 'long' }) + ' ' + now.getFullYear();
      break;
    }
    default: {
      start = fmtDate(now);
      end = fmtDate(now);
      label = 'Custom Period';
    }
  }

  return { start: start, end: end, label: label };
}

// ── Jira API via Next.js backend (no CORS issues) ──────────────────
async function fetchIssuesByJql(jql) {
  var res = await fetch('/api/jira?action=jql&jql=' + encodeURIComponent(jql));
  if (!res.ok) {
    var errBody = await res.json().catch(function(){ return {error: res.statusText}; });
    throw new Error('JQL error: ' + (errBody.error || res.statusText));
  }
  var data = await res.json();
  return data.issues || [];
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
    throw new Error(err.error || 'Failed to fetch pages');
  }
  var data = await res.json();
  return { pages: data.pages || [], total: data.total || 0 };
}

// ── Anthropic API ──────────────────────────────────────────────────────────────
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
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(rawText);
  } catch (e) {
    throw new Error('Format balasan AI salah atau tidak bisa di-parse.');
  }
}

// ── Build Confluence HTML (Kanban Period Log) ──────────────────────
function escapeHTML(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildHTML(objectives, metrics) {
  function col(s) {
    if (s === 'achieved') return 'green';
    if (s === 'partially achieved') return 'yellow';
    if (s === 'invalid') return 'neutral';
    return 'red';
  }

  var rows = objectives
    .map(function (g, i) {
      return (
        '<tr><td><p>' +
        (i + 1) +
        '</p></td><td><p>' +
        escapeHTML(g.text) +
        '</p></td>' +
        '<td><p><span data-type="status" data-color="' +
        col(g.status) +
        '">' +
        g.status +
        '</span></p></td>' +
        '<td><p>' +
        escapeHTML(g.comment || '') +
        '</p></td></tr>'
      );
    })
    .join('');

  // Period Metrics
  var metricsHtml = '';
  if (metrics) {
    var statusRows = Object.entries(metrics.statusCounts || {}).map(function (e) {
      return '<tr><td><p>' + escapeHTML(e[0]) + '</p></td><td><p>' + e[1] + '</p></td></tr>';
    }).join('');

    metricsHtml =
      '<table><tbody>' +
      '<tr><td><p><strong>Period</strong></p></td><td><p>' + escapeHTML(metrics.periodLabel) + '</p></td></tr>' +
      '<tr><td><p><strong>Date Range</strong></p></td><td><p>' + metrics.periodStart + ' → ' + metrics.periodEnd + '</p></td></tr>' +
      '<tr><td><p><strong>Days</strong></p></td><td><p>' + metrics.daysInPeriod + '</p></td></tr>' +
      '<tr><td><p><strong>Total Resolved</strong></p></td><td><p>' + metrics.totalResolved + '</p></td></tr>' +
      '<tr><td><p><strong>Throughput</strong></p></td><td><p>' + metrics.throughputPerDay + ' / day</p></td></tr>' +
      statusRows +
      '</tbody></table>';
  }

  return (
    '<p><em>Title format: [Team_Name] Period Log</em></p>' +
    '<h1>Period Metrics</h1>' +
    (metricsHtml || '<p><em>No metrics available.</em></p>') +
    '<h1>Objectives</h1>' +
    '<table><thead><tr>' +
    '<th><p><strong>No</strong></p></th><th><p><strong>Objective</strong></p></th>' +
    '<th><p><strong>Status</strong></p></th><th><p><strong>Comment</strong></p></th>' +
    '</tr></thead><tbody>' +
    rows +
    '</tbody></table>' +
    '<h2>Completed Tickets</h2>' +
    objectives.map(function(g){
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
    'Select Team',
    'Period & Objectives',
    'Fetch Tickets',
    'Review',
    'Done',
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
                {done ? '\u2713' : n}
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
        placeholder="Comment for period review..."
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
                <span style={{ fontSize:11, color:'#172B4D' }}>
                  {(t.summary || '').slice(0, 60)}
                </span>
                {t.subtasks && t.subtasks.length > 0 && (
                  <div style={{ fontSize:10, color:'#6B778C', display:'flex', flexDirection:'column', gap:2, marginLeft:16 }}>
                    {t.subtasks.map(function (s) {
                      var sbg = s.statusCategory === 'done' ? '#E3FCEF' : s.statusCategory === 'new' ? '#F4F5F7' : '#FFFAE6';
                      var sc = s.statusCategory === 'done' ? '#006644' : s.statusCategory === 'new' ? '#6B778C' : '#974F0C';
                      return (
                        <div key={s.key} style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ padding:'1px 6px', borderRadius:3, background:sbg, color:sc }}>
                            {s.key}
                          </span>
                          <span style={{ color:'#5E6C84' }}>{(s.summary || '').slice(0, 50)}</span>
                        </div>
                      );
                    })}
                  </div>
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

  // Period state
  var periodStartState = useState('');
  var periodStart = periodStartState[0];
  var setPeriodStart = periodStartState[1];
  var periodEndState = useState('');
  var periodEnd = periodEndState[0];
  var setPeriodEnd = periodEndState[1];
  var periodLabelState = useState('');
  var periodLabel = periodLabelState[0];
  var setPeriodLabel = periodLabelState[1];
  var objectivesTextState = useState('');
  var objectivesText = objectivesTextState[0];
  var setObjectivesText = objectivesTextState[1];

  // Shared state
  var goalsState = useState([]);
  var goals = goalsState[0];
  var setGoals = goalsState[1];
  var loadingState = useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];
  var loadingMsgState = useState('');
  var loadingMsg = loadingMsgState[0];
  var setLoadingMsg = loadingMsgState[1];
  var errorState = useState('');
  var error = errorState[0];
  var setError = errorState[1];
  var createdUrlState = useState('');
  var createdUrl = createdUrlState[0];
  var setCreatedUrl = createdUrlState[1];

  // Period metrics
  var metricsState = useState(null);
  var metrics = metricsState[0];
  var setMetrics = metricsState[1];

  // Confluence state
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
  var activePresetState = useState('thisWeek');
  var activePreset = activePresetState[0];
  var setActivePreset = activePresetState[1];

  var team = TEAM_CONFIG[pk];

  // Fetch Confluence spaces on mount
  useEffect(function () {
    fetchConfluenceSpaces().then(function (s) {
      setSpaces(s);
    });
  }, []);

  var fetchRef = useRef(0);

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

  useEffect(function () {
    if (step !== 4) return;
    doFetchPages(selectedSpace);
  }, [step]);

  function handlePagesSearchInput(value) {
    setPagesSearch(value);
    setPagesOpen(true);
  }

  function fillPeriodPreset(preset) {
    var d = getPeriodDates(preset);
    setPeriodStart(d.start);
    setPeriodEnd(d.end);
    setPeriodLabel(d.label);
    setActivePreset(preset);
  }

  function parseLines(raw) {
    return (raw || '')
      .split('\n')
      .map(function (l) {
        return l
          .replace(/^\s*\d+[.)]\s*/, '')
          .replace(/\u2192/g, '-')
          .trim();
      })
      .filter(function (l) {
        return l.length > 3;
      });
  }

  function doFetchAndCategorize() {
    var lines = parseLines(objectivesText);
    if (!lines.length) {
      setError('Minimal isi 1 objective.');
      return;
    }
    if (!periodStart || !periodEnd) {
      setError('Isi tanggal awal dan akhir period.');
      return;
    }
    if (!periodLabel.trim()) {
      setError('Period label cannot be empty.');
      return;
    }
    setError('');
    setLoading(true);
    setStep(3);
    setLoadingMsg('Fetching completed tickets from Jira...');

    var jql = 'project = "' + pk + '" AND resolved >= "' + periodStart + '" AND resolved <= "' + periodEnd + '"';

    fetchIssuesByJql(jql)
      .then(function (issues) {
        setLoadingMsg(issues.length + ' tickets found. Mapping to objectives via AI...');

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
            return (i + 1) + '. ' + g;
          })
          .join('\n');

        // Compute period metrics
        var daysInPeriod = Math.ceil((new Date(periodEnd + 'T23:59:59').getTime() - new Date(periodStart + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
        var statusCounts = {};
        issues.forEach(function (t) {
          statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        });
        var throughput = daysInPeriod > 0 ? (issues.length / daysInPeriod) : 0;

        var periodMetrics = {
          periodStart: periodStart,
          periodEnd: periodEnd,
          periodLabel: periodLabel.trim(),
          daysInPeriod: daysInPeriod,
          totalResolved: issues.length,
          throughputPerDay: Math.round(throughput * 10) / 10,
          statusCounts: statusCounts,
        };

        return anthropicJSON(
          'You are an experienced engineering manager writing a detailed period-end report. Return ONLY minified JSON no whitespace no markdown.',
          'Objectives:\n' +
            goalStr +
            '\nCompleted Tickets (each has key, type):\n' +
            ticketLines +
            '\nFor each objective:\n' +
            '1. Find which tickets are relevant (ticketKeys)\n' +
            '2. Derive status: achieved / partially achieved / not achieved / invalid\n' +
            '3. Write a DETAILED comment (3-5 sentences) covering:\n' +
            '   - What was accomplished and key outcomes\n' +
            '   - Notable challenges or blockers encountered\n' +
            '   - Dependencies or cross-team coordination involved\n' +
            '   - Quality notes or areas needing follow-up\n' +
            '4. If status is "partially achieved", explain what remains and why.\n' +
            '\nAn objective is achieved if all its tickets are completed, partially if some are done.' +
            '\nReturn: {"goals":[{"text":"...","status":"...","ticketKeys":["' +
            pk +
            '-1"],"comment":"detailed multi-sentence comment here"}]}'
        ).then(function (mp) {
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
          setMetrics(periodMetrics);
          setStep(4);
          setLoading(false);
        });
      })
      .catch(function (err) {
        setError('Failed: ' + err.message);
        setStep(2);
        setLoading(false);
      });
  }

  function doCreatePage() {
    setLoading(true);
    setLoadingMsg('Creating page in Confluence...');
    var title = team.name + ' - ' + periodLabel + ' Period Log';
    var body = buildHTML(goals, metrics);

    fetch('/api/confluence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title, body: body, spaceKey: selectedSpace, parentId: selectedParent }),
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Failed'); });
        return res.json();
      })
      .then(function (result) {
        setCreatedUrl(result.pageUrl);
        setStep(5);
        setLoading(false);
      })
      .catch(function (err) {
        setError('Failed to create page: ' + err.message);
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
    setPeriodStart('');
    setPeriodEnd('');
    setPeriodLabel('');
    setObjectivesText('');
    setMetrics(null);
    setCreatedUrl('');
    setError('');
    setSelectedSpace('PD');
    setSelectedParent('51160186939');
    setActivePreset('thisWeek');
  }

  function goToStep2() {
    setError('');
    var d = getPeriodDates('thisWeek');
    setPeriodStart(d.start);
    setPeriodEnd(d.end);
    setPeriodLabel(d.label);
    setActivePreset('thisWeek');
    setStep(2);
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
          <h1 style={{ color:'#172B4D', fontSize:28, margin:'0 0 8px' }}>Period Log Generator</h1>
          <p style={{ color:'#6B778C', fontSize:14, margin:'0 0 24px', lineHeight:1.5 }}>
            Generate Kanban period log to Confluence automatically.
          </p>
          <a
            href="/api/auth/login"
            style={{
              display:'inline-block', padding:'12px 32px', background:'#0052CC', color:'#fff',
              borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:14,
            }}
          >
            Login with Atlassian
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
            {/* Kanban board icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
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
              Period Log Generator
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#6B778C' }}>
              Auto-generate Kanban Period Log · A&T Tribe
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
            <span>{'\u26A0\uFE0F'}</span>
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
              Select Team
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
            <Btn onClick={goToStep2}>
              Lanjut - Set Period & Objectives
            </Btn>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: 15,
                fontWeight: 700,
                color: '#172B4D',
              }}
            >
              Period & Objectives — {team.name} Team
            </h2>

            {/* Period Presets */}
            <label style={{ fontSize: 13, fontWeight: 600, color: '#172B4D', display: 'block', marginBottom: 6 }}>
              Period
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {Object.keys(PRESET_LABELS).map(function (key) {
                return (
                  <button
                    key={key}
                    onClick={function () { fillPeriodPreset(key); }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: '2px solid',
                      fontWeight: 600,
                      fontSize: 12,
                      borderColor: activePreset === key ? '#0052CC' : '#DFE1E6',
                      background: activePreset === key ? '#E8F0FE' : '#fff',
                      color: activePreset === key ? '#0052CC' : '#6B778C',
                    }}
                  >
                    {PRESET_LABELS[key]}
                  </button>
                );
              })}
            </div>

            {/* Date Range */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#6B778C', display: 'block', marginBottom: 4 }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={function (e) { setPeriodStart(e.target.value); }}
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
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#6B778C', display: 'block', marginBottom: 4 }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={function (e) { setPeriodEnd(e.target.value); }}
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
              </div>
            </div>

            {/* Period Label */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#172B4D', display: 'block', marginBottom: 6 }}>
                Period Label
              </label>
              <input
                value={periodLabel}
                onChange={function (e) { setPeriodLabel(e.target.value); }}
                placeholder="contoh: Week 26 2026"
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
            </div>

            {/* Objectives */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#172B4D', display: 'block', marginBottom: 6 }}>
                Period Objectives
              </label>
              <textarea
                value={objectivesText}
                onChange={function (e) { setObjectivesText(e.target.value); }}
                placeholder={
                  '1. First objective\n2. Second objective\n\n(Enter the objectives for this period)'
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
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Btn
                secondary
                onClick={function () {
                  setStep(1);
                }}
              >
                Change Team
              </Btn>
              <Btn
                onClick={doFetchAndCategorize}
                disabled={!periodStart || !periodEnd || !periodLabel.trim() || !objectivesText.trim()}
              >
                Fetch Tickets & Auto-Map
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
            {/* Period Header */}
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
                    Period Log — {team.name} Team
                  </div>
                  <div
                    style={{ fontWeight: 700, color: '#172B4D', fontSize: 16 }}
                  >
                    {periodLabel}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B778C', marginTop: 4 }}>
                    {periodStart} &rarr; {periodEnd}
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
                  {goals.length} Objectives
                </div>
              </div>
            </Card>

            {/* Period Metrics */}
            {metrics && (
              <Card style={{ marginBottom: 14 }}>
                <h3 style={{ margin:'0 0 12px', fontSize:14, fontWeight:700, color:'#172B4D' }}>
                  Period Metrics
                </h3>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
                  <div style={{ background:'#F4F5F7', borderRadius:8, padding:'12px 16px', flex:1, minWidth:100, textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:700, color:'#0052CC' }}>{metrics.totalResolved}</div>
                    <div style={{ fontSize:11, color:'#6B778C' }}>Resolved</div>
                  </div>
                  <div style={{ background:'#F4F5F7', borderRadius:8, padding:'12px 16px', flex:1, minWidth:100, textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:700, color:'#0052CC' }}>{metrics.throughputPerDay}</div>
                    <div style={{ fontSize:11, color:'#6B778C' }}>/ day</div>
                  </div>
                  <div style={{ background:'#F4F5F7', borderRadius:8, padding:'12px 16px', flex:1, minWidth:100, textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:700, color:'#0052CC' }}>{metrics.daysInPeriod}</div>
                    <div style={{ fontSize:11, color:'#6B778C' }}>Days</div>
                  </div>
                </div>
                {Object.keys(metrics.statusCounts || {}).length > 0 && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {Object.entries(metrics.statusCounts).map(function (e) {
                      return (
                        <span key={e[0]} style={{ padding:'3px 10px', borderRadius:10, background:'#E8F0FE', color:'#0052CC', fontSize:11, fontWeight:600 }}>
                          {e[0]}: {e[1]}
                        </span>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Confluence Destination */}
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
                          <div style={{ padding:'6px 12px', fontSize:11, color:'#6B778C', borderBottom:'1px solid #F4F5F7' }}>{pages.filter(function(p){ return !pagesSearch || p.title.toLowerCase().indexOf(pagesSearch.toLowerCase()) !== -1; }).length} filtered (total: {pagesTotal})</div>
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

            {/* Objectives Review */}
            <Card style={{ marginBottom: 14 }}>
              <h3
                style={{
                  margin: '0 0 6px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#172B4D',
                }}
              >
                Review dan Edit Objectives
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B778C' }}>
                Status di-derive dari ticket completion. PM/EM bisa adjust sebelum
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
                Edit Period
              </Btn>
              <Btn onClick={doCreatePage} disabled={loading}>
                {loading ? 'Creating...' : 'Publish to Confluence'}
              </Btn>
            </div>
          </div>
        )}

        {step === 5 && (
          <Card style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{'\uD83C\uDF89'}</div>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 18,
                fontWeight: 700,
                color: '#172B4D',
              }}
            >
              Period Log berhasil dibuat!
            </h2>
            <p style={{ margin: '0 0 24px', color: '#6B778C', fontSize: 14 }}>
              Document already in Confluence. PM/EM can complete the
              Issues and Escalation review.
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
              Open in Confluence
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
                Generate Period Log lagi
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
