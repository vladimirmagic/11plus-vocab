import React from 'react';

const sectionCard = {
  background: 'var(--white, #fff)',
  borderRadius: 16,
  padding: '24px 28px',
  marginBottom: 20,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  border: '2px solid var(--cream-dark, #e0d5c1)',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  borderRadius: 12,
  overflow: 'hidden',
  fontSize: 14,
};

const thStyle = {
  background: 'var(--green, #6b9e7a)',
  color: 'white',
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: 13,
};

const tdStyle = (idx) => ({
  padding: '10px 14px',
  background: idx % 2 === 0 ? 'var(--cream, #f5f0e8)' : 'var(--white, #fff)',
  borderBottom: '1px solid var(--cream-dark, #e0d5c1)',
  fontSize: 14,
});

const sectionTitle = {
  fontSize: 20,
  fontWeight: 800,
  color: 'var(--green-dark, #4a7a5a)',
  marginBottom: 14,
  marginTop: 0,
};

const badgeGroup = {
  marginBottom: 14,
};

const badgeLabel = {
  fontWeight: 700,
  fontSize: 14,
  color: 'var(--green-dark, #4a7a5a)',
  marginBottom: 6,
};

const badgePill = (bg) => ({
  display: 'inline-block',
  padding: '4px 12px',
  margin: '3px 4px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 600,
  background: bg || 'var(--cream, #f5f0e8)',
  color: 'var(--green-dark, #4a7a5a)',
  border: '1px solid var(--cream-dark, #e0d5c1)',
});

const tipItem = {
  padding: '8px 0',
  fontSize: 14,
  lineHeight: 1.6,
  color: '#444',
  borderBottom: '1px solid var(--cream-dark, #e0d5c1)',
};

const bonusItem = {
  padding: '6px 0',
  fontSize: 14,
  color: '#444',
};

const tierRow = (bg) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  borderRadius: 10,
  marginBottom: 6,
  background: bg,
  fontWeight: 600,
  fontSize: 14,
});

export default function Help() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Intro */}
      <div style={{ ...sectionCard, textAlign: 'center', background: 'linear-gradient(135deg, var(--green, #6b9e7a) 0%, var(--green-dark, #4a7a5a) 100%)', color: 'white', border: 'none' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, marginTop: 0 }}>
          How It Works
        </h1>
        <p style={{ fontSize: 15, opacity: 0.95, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          Welcome to your learning adventure! Here's everything you need to know about earning points, growing your tree, and becoming a vocabulary champion.
        </p>
      </div>

      {/* Section 1: How Points Work */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'\u2B50 How Points Work'}</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Activity</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Correct</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Wrong</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Matching Game (per word)', '+10 pts', '-3 pts'],
              ['Sentence Builder', '+20 pts', '-5 pts'],
              ['Picture Prompt', '+15 pts', '-4 pts'],
              ['Related Match', '+10 pts', '-3 pts'],
            ].map(([activity, correct, wrong], idx) => (
              <tr key={idx}>
                <td style={tdStyle(idx)}>{activity}</td>
                <td style={{ ...tdStyle(idx), textAlign: 'center', color: 'var(--green-dark, #4a7a5a)', fontWeight: 700 }}>{correct}</td>
                <td style={{ ...tdStyle(idx), textAlign: 'center', color: 'var(--red, #e74c3c)', fontWeight: 700 }}>{wrong}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange, #f39c12)', marginTop: 18, marginBottom: 8 }}>
          Bonus Points
        </h3>
        <div style={bonusItem}>Every 5 correct answers in a row: <strong style={{ color: 'var(--green-dark, #4a7a5a)' }}>+10 bonus</strong></div>
        <div style={bonusItem}>Perfect matching round (8/8): <strong style={{ color: 'var(--green-dark, #4a7a5a)' }}>+25 bonus</strong></div>
        <div style={bonusItem}>Hit your daily target: <strong style={{ color: 'var(--green-dark, #4a7a5a)' }}>+15 bonus</strong></div>

        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: 'var(--cream, #f5f0e8)', fontSize: 13, color: '#555', lineHeight: 1.6,
        }}>
          <strong>Daily Target:</strong> Your daily target is calculated from your scheduled words — roughly 110 points per day. Check the sidebar to see your progress!
        </div>
      </div>

      {/* Section 2: Your Growth Tree */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'Your Growth Tree \uD83C\uDF33'}</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Stage</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Points Needed</th>
              <th style={thStyle}>What You'll See</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['\uD83C\uDF30 Seed', '0 pts', 'A tiny seed in the soil'],
              ['\uD83C\uDF31 Sprout', '50 pts', 'A small green shoot'],
              ['\uD83C\uDF3F Sapling', '200 pts', 'A small tree with branches'],
              ['\uD83C\uDF32 Young Tree', '500 pts', 'A growing tree with flowers'],
              ['\uD83C\uDF33 Full Tree', '1,000 pts', 'A beautiful tree with birds'],
              ['\u2728 Grand Tree', '2,000 pts', 'A majestic golden tree!'],
            ].map(([stage, pts, desc], idx) => (
              <tr key={idx}>
                <td style={tdStyle(idx)}>{stage}</td>
                <td style={{ ...tdStyle(idx), textAlign: 'center', fontWeight: 700 }}>{pts}</td>
                <td style={tdStyle(idx)}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{
          marginTop: 14, padding: '12px 16px', borderRadius: 10,
          background: '#e8f5e9', fontSize: 13, color: '#2e7d32', lineHeight: 1.6,
        }}>
          When you get answers wrong, your tree's leaves start to dry out. But don't worry — getting answers right makes them green again! Your tree never shrinks a whole stage.
        </div>
      </div>

      {/* Section 3: Daily Streak */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'\uD83D\uDD25 Daily Streak'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['\uD83D\uDCC5', 'Practice every day to build your streak'],
            ['\u2705', 'Even 1 point counts for the day'],
            ['\u2744\uFE0F', 'Every 7-day streak earns you a streak freeze (max 2)'],
            ['\uD83D\uDEE1\uFE0F', 'Streak freezes protect you if you miss a day'],
          ].map(([emoji, text], idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: idx % 2 === 0 ? 'var(--cream, #f5f0e8)' : 'var(--white, #fff)',
              fontSize: 14, color: '#444',
            }}>
              <span style={{ fontSize: 18 }}>{emoji}</span>
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Achievement Badges */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'\uD83C\uDFC6 Achievement Badges'}</h2>

        <div style={badgeGroup}>
          <div style={badgeLabel}>Points Badges</div>
          {['First Steps (1pt)', 'Double Digits (10)', 'Rising Star (50)', 'Triple Digits (100)', 'Word Wizard (500)', 'Legendary (1000)', 'Grand Master (2000)'].map((b, i) => (
            <span key={i} style={badgePill('#fff8e1')}>{b}</span>
          ))}
        </div>

        <div style={badgeGroup}>
          <div style={badgeLabel}>Streak Badges</div>
          {['Hat Trick (3 days)', 'One Week (7)', 'Fortnight (14)', 'Monthly Master (30)'].map((b, i) => (
            <span key={i} style={badgePill('#fce4ec')}>{b}</span>
          ))}
        </div>

        <div style={badgeGroup}>
          <div style={badgeLabel}>Word Mastery</div>
          {['Word Collector (10 words)', 'Bookworm (25)', 'Scholar (50)', 'Complete! (all words)'].map((b, i) => (
            <span key={i} style={badgePill('#e8f5e9')}>{b}</span>
          ))}
        </div>

        <div style={badgeGroup}>
          <div style={badgeLabel}>Game Badges</div>
          {['First Match', 'Wordsmith (first sentence)', 'Perfectionist (perfect round)', 'Flawless (10 perfect)', 'Author (100 sentences)'].map((b, i) => (
            <span key={i} style={badgePill('#e3f2fd')}>{b}</span>
          ))}
        </div>
      </div>

      {/* Section 5: Leaderboard Leagues */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'\uD83C\uDFC5 Leaderboard Leagues'}</h2>
        {[
          { emoji: '\uD83E\uDD49', label: 'Bronze', range: '0 - 499 pts', bg: '#fdf0e2' },
          { emoji: '\uD83E\uDD48', label: 'Silver', range: '500 - 999 pts', bg: '#f0f0f0' },
          { emoji: '\uD83E\uDD47', label: 'Gold', range: '1,000 - 1,999 pts', bg: '#fff8e1' },
          { emoji: '\uD83D\uDC8E', label: 'Diamond', range: '2,000+ pts', bg: '#e3f2fd' },
        ].map((tier, idx) => (
          <div key={idx} style={tierRow(tier.bg)}>
            <span style={{ fontSize: 22 }}>{tier.emoji}</span>
            <span style={{ minWidth: 80 }}>{tier.label}</span>
            <span style={{ color: 'var(--text-muted, #888)', fontWeight: 500 }}>{tier.range}</span>
          </div>
        ))}
      </div>

      {/* Section 6: Tips */}
      <div style={sectionCard}>
        <h2 style={sectionTitle}>{'\uD83D\uDCA1 Tips to Earn More Points'}</h2>
        {[
          'Play the Matching Game daily — it\'s the fastest way to earn points',
          'Try Sentence Builder for bigger point rewards (+20 per correct!)',
          'Aim for perfect rounds (8/8) to get the +25 bonus',
          'Keep a streak going — every 5 correct answers earns +10 extra',
          'Check your Calendar and learn your scheduled words each day',
          'Don\'t worry about wrong answers — you only lose a few points, and you learn from mistakes!',
        ].map((tip, idx) => (
          <div key={idx} style={tipItem}>
            <span style={{ fontWeight: 700, color: 'var(--green, #6b9e7a)', marginRight: 8 }}>{idx + 1}.</span>
            {tip}
          </div>
        ))}
      </div>
    </div>
  );
}
