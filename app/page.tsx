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
    </div>
  );
}
