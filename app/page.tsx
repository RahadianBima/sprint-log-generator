'use client';
import { useEffect } from 'react';

export default function HomePage() {
  useEffect(function () {
    document.title = 'Log Generator';
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: '2.5rem',
          fontWeight: 700,
          color: '#172B4D',
          marginBottom: '0.5rem',
        }}
      >
        Log Generator
      </h1>
      <p
        style={{
          fontSize: '1.1rem',
          color: '#5E6C84',
          marginBottom: '3rem',
        }}
      >
        Choose the type of log you want to generate
      </p>

      <div
        style={{
          display: 'flex',
          gap: '2rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <a
          href="/sprint"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 280,
            height: 200,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            textDecoration: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
          }}
          onMouseEnter={function (e) {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={function (e) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
        >
          <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏃</span>
          <span
            style={{
              fontSize: '1.3rem',
              fontWeight: 600,
              color: '#172B4D',
            }}
          >
            Sprint Log
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              color: '#5E6C84',
              marginTop: '0.5rem',
              textAlign: 'center',
              padding: '0 1rem',
            }}
          >
            Generate sprint goals & health report from active Jira sprint
          </span>
        </a>

        <a
          href="/kanban"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 280,
            height: 200,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            textDecoration: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
          }}
          onMouseEnter={function (e) {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={function (e) {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
        >
          <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</span>
          <span
            style={{
              fontSize: '1.3rem',
              fontWeight: 600,
              color: '#172B4D',
            }}
          >
            Period Log
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              color: '#5E6C84',
              marginTop: '0.5rem',
              textAlign: 'center',
              padding: '0 1rem',
            }}
          >
            Generate period-end log with custom date range & objectives
          </span>
        </a>
      </div>

      <div
        style={{
          marginTop: '3.5rem',
          maxWidth: 720,
          width: '100%',
          padding: '0 1rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            color: '#172B4D',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          How It Works
        </h2>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: '1.5rem 2rem',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0052CC', marginBottom: '0.75rem' }}>
            🏃 Sprint Log
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8, color: '#172B4D', fontSize: '0.9rem' }}>
            <li><strong>Select Team</strong> — choose your Jira team/board (COS, PRO, FIN, etc.)</li>
            <li><strong>Fetch Sprint</strong> — app automatically finds the active sprint for that board</li>
            <li><strong>Review & AI Mapping</strong> — AI maps sprint goals to completed tickets, generates status & detailed comment for each goal</li>
            <li><strong>Publish</strong> — review the result, select Confluence space & parent page, then publish</li>
          </ol>
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: '1.5rem 2rem',
          }}
        >
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color:'#0052CC', marginBottom: '0.75rem' }}>
            📋 Period Log
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8, color: '#172B4D', fontSize: '0.9rem' }}>
            <li><strong>Select Team</strong> — choose your Jira team/board</li>
            <li><strong>Set Period & Objectives</strong> — enter date range, period label, and list of objectives for this period</li>
            <li><strong>Fetch Tickets</strong> — app queries Jira for completed/resolved tickets in the date range</li>
            <li><strong>Review</strong> — AI maps tickets to objectives, shows throughput metrics, and generates detailed status & comment for each objective</li>
            <li><strong>Publish</strong> — select Confluence space & parent page, then publish the period log</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
