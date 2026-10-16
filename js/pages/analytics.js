// ─────────────────────────────────────────────────────────────
//  pages/analytics.js — Financial Analytics & MoM Trends
//  Finance Tracker v4.0 (Zero-Emoji SVG Icons)
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonthShort } from '../format.js';
import { currentMonth } from '../schema.js';
import { getSubscriptions } from '../subscriptions.js';
import { renderIcon } from '../icons.js';

let barChart    = null;
let pieChart    = null;
let trendChart  = null;

export async function initAnalytics(container, store) {
  const endMonth  = currentMonth();
  const months    = last6Months(endMonth);
  let catMonth    = endMonth;

  async function renderPieSection() {
    const [categories, allTxs] = await Promise.all([
      store.getCategories(),
      store.getTransactions({}),
    ]);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    const monthTxs = allTxs.filter(t => t.date?.startsWith(catMonth) && t.type === 'expense');
    const catTotals = {};
    for (const tx of monthTxs) {
      const cat = catMap[tx.categoryId];
      if (!cat) continue;
      catTotals[tx.categoryId] = catTotals[tx.categoryId] || { cat, total: 0 };
      catTotals[tx.categoryId].total += tx.amountMinor;
    }
    const catBreakdown = Object.values(catTotals).sort((a, b) => b.total - a.total);
    const totalExp = catBreakdown.reduce((s, e) => s + e.total, 0);

    const pieSection = document.getElementById('cat-pie-section');
    if (!pieSection) return;

    pieSection.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">รายจ่ายตามหมวดหมู่</h2>
          <div class="cat-month-nav">
            <button class="icon-btn" id="cat-prev-month" title="เดือนก่อน">
              ${renderIcon('chevron-left', 14)}
            </button>
            <span class="cat-month-label">${formatMonthShort(catMonth)}</span>
            <button class="icon-btn" id="cat-next-month" title="เดือนถัดไป">
              ${renderIcon('chevron-right', 14)}
            </button>
          </div>
        </div>
        ${catBreakdown.length > 0 ? `
          <div class="chart-wrap chart-wrap-donut">
            <canvas id="pie-chart"></canvas>
          </div>
          <!-- Category Ranking Progress Bars -->
          <div class="cat-ranking-list">
            ${catBreakdown.map((e, i) => {
              const pct = totalExp > 0 ? Math.round((e.total / totalExp) * 100) : 0;
              const color = PIE_COLORS[i % PIE_COLORS.length];
              return `
                <div class="cat-bar-item">
                  <div class="cat-bar-header">
                    <span class="cat-bar-name">${renderIcon(e.cat.icon || 'box', 14)} ${e.cat.name}</span>
                    <span class="cat-bar-val mono">${formatTHB(e.total)} <span class="cat-bar-pct">(${pct}%)</span></span>
                  </div>
                  <div class="cat-progress-bg">
                    <div class="cat-progress-fill" style="width:${pct}%;background:${color}"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div class="empty-state-sm">ยังไม่มีรายจ่ายในเดือนนี้</div>'}
      </div>
    `;

    requestAnimationFrame(() => {
      if (catBreakdown.length > 0) drawPieChart(catBreakdown, totalExp);
    });

    document.getElementById('cat-prev-month')?.addEventListener('click', () => {
      catMonth = offsetMonth(catMonth, -1);
      renderPieSection();
    });
    document.getElementById('cat-next-month')?.addEventListener('click', () => {
      catMonth = offsetMonth(catMonth, 1);
      renderPieSection();
    });
  }

  async function render() {
    const [categories, allTxs] = await Promise.all([
      store.getCategories(),
      store.getTransactions({}),
    ]);

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const monthData = await Promise.all(months.map(m => store.getMonthSummary(m)));

    const curMonthData = monthData[monthData.length - 1];
    const prevMonthData = monthData[monthData.length - 2] || { income: 0, expense: 0, net: 0 };

    const expDiff = curMonthData.expense - prevMonthData.expense;
    const expPct = prevMonthData.expense > 0 ? Math.round((expDiff / prevMonthData.expense) * 100) : 0;

    const incDiff = curMonthData.income - prevMonthData.income;
    const incPct = prevMonthData.income > 0 ? Math.round((incDiff / prevMonthData.income) * 100) : 0;

    const savingRates = monthData.map(d => d.income > 0 ? Math.round((d.net / d.income) * 100) : 0);
    const curSavingRate = savingRates[savingRates.length - 1];

    let healthLabel = 'พอดีตัว (0-15%)';
    let healthClass = 'neutral';
    if (curSavingRate >= 30) {
      healthLabel = 'ยอดเยี่ยม (>30%)';
      healthClass = 'better';
    } else if (curSavingRate >= 15) {
      healthLabel = 'สุขภาพดี (15-30%)';
      healthClass = 'better';
    } else if (curSavingRate >= 0) {
      healthLabel = 'พอดีตัว (0-15%)';
      healthClass = 'neutral';
    } else {
      healthLabel = 'ติดลบ (เกินรายรับ)';
      healthClass = 'worse';
    }

    const subs = getSubscriptions();
    const totalFixedMinor = subs.reduce((s, sub) => s + (sub.amountMinor || 0), 0);
    const fixedPct = curMonthData.expense > 0 ? Math.min(100, Math.round((totalFixedMinor / curMonthData.expense) * 100)) : 0;
    const varPct = Math.max(0, 100 - fixedPct);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">วิเคราะห์</h1>
          <span class="page-subtitle">${formatMonthShort(months[0])} – ${formatMonthShort(endMonth)}</span>
        </div>
      </div>

      <div class="page-body">
        <!-- Month-over-Month Comparison Grid -->
        <div class="mom-grid">
          <div class="mom-card">
            <div class="mom-header">
              <span class="mom-label">รายจ่ายเดือนนี้ (${formatMonthShort(endMonth)})</span>
              <span class="mom-pill ${expDiff <= 0 ? 'better' : 'worse'}">
                ${expDiff <= 0 ? '↓' : '↑'} ${Math.abs(expPct)}% ${expDiff <= 0 ? 'ลดลง' : 'เพิ่มขึ้น'}
              </span>
            </div>
            <div class="mom-value expense">${formatTHB(curMonthData.expense)}</div>
            <div class="stat-sub">
              ${expDiff <= 0 ? 'ประหยัดกว่าเดือนก่อน ' : 'ใช้มากกว่าเดือนก่อน '}
              <span class="mono">${formatTHB(Math.abs(expDiff))}</span>
            </div>
          </div>

          <div class="mom-card">
            <div class="mom-header">
              <span class="mom-label">รายรับเดือนนี้</span>
              <span class="mom-pill ${incDiff >= 0 ? 'better' : 'neutral'}">
                ${incDiff >= 0 ? '↑' : '↓'} ${Math.abs(incPct)}%
              </span>
            </div>
            <div class="mom-value income">${formatTHB(curMonthData.income)}</div>
            <div class="stat-sub">
              เทียบเดือนก่อน ${incDiff >= 0 ? '+' : '-'}<span class="mono">${formatTHB(Math.abs(incDiff))}</span>
            </div>
          </div>

          <div class="mom-card">
            <div class="mom-header">
              <span class="mom-label">คงเหลือสุทธิ & อัตราออม</span>
              <span class="mom-pill ${healthClass}">
                ${healthLabel}
              </span>
            </div>
            <div class="mom-value ${curMonthData.net >= 0 ? 'income' : 'expense'}">${formatTHB(curMonthData.net)}</div>
            <div class="stat-sub">
              อัตราการออมเดือนนี้ <strong class="mono ${curSavingRate >= 0 ? 'income' : 'expense'}">${curSavingRate}%</strong>
            </div>
          </div>
        </div>

        ${totalFixedMinor > 0 ? `
          <!-- Fixed vs Variable Expenses Ratio Card -->
          <div class="card" style="margin-bottom:16px;padding:14px 16px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:13px;font-weight:600;color:var(--text)">สัดส่วนรายจ่ายประจำคงที่ vs ผันแปร</span>
              <span class="badge badge-neutral" style="font-size:11px">บิลประจำ</span>
            </div>
            <div class="fixed-ratio-bar">
              <div class="fixed-ratio-fill" style="width:${fixedPct}%;background:var(--primary)" title="รายจ่ายประจำ ${fixedPct}%"></div>
              <div class="fixed-ratio-fill" style="width:${varPct}%;background:var(--income)" title="รายจ่ายผันแปร ${varPct}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
              <span>● ประจำ: <span class="mono font-semibold">${formatTHB(totalFixedMinor)} (${fixedPct}%)</span></span>
              <span>● ผันแปร: <span class="mono font-semibold">${formatTHB(Math.max(0, curMonthData.expense - totalFixedMinor))} (${varPct}%)</span></span>
            </div>
          </div>
        ` : ''}

        <!-- Income vs Expense bar chart -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">รายรับ vs รายจ่าย (6 เดือนย้อนหลัง)</h2>
          </div>
          <div class="chart-wrap">
            <canvas id="bar-chart"></canvas>
          </div>
        </div>

        <div class="dashboard-grid">
          <!-- Category breakdown pie (with month selector) -->
          <div id="cat-pie-section"></div>

          <!-- Saving rate trend -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">แนวโน้มอัตราออม</h2>
            </div>
            <div class="chart-wrap">
              <canvas id="trend-chart"></canvas>
            </div>
            <div class="saving-summary">
              <div class="saving-row">
                <span>เฉลี่ย 6 เดือน</span>
                <span class="mono ${avg(savingRates) >= 0 ? 'income' : 'expense'}">${avg(savingRates)}%</span>
              </div>
              <div class="saving-row">
                <span>${formatMonthShort(endMonth)}</span>
                <span class="mono ${savingRates[savingRates.length - 1] >= 0 ? 'income' : 'expense'}">${savingRates[savingRates.length - 1]}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Month summary table -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">สรุปรายเดือน</h2>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th class="num">รายรับ</th>
                  <th class="num">รายจ่าย</th>
                  <th class="num">คงเหลือ</th>
                  <th class="num">อัตราออม</th>
                </tr>
              </thead>
              <tbody>
                ${months.slice().reverse().map((m, i) => {
                  const d  = monthData[months.length - 1 - i];
                  const sr = d.income > 0 ? Math.round((d.net / d.income) * 100) : 0;
                  return `
                    <tr>
                      <td>${formatMonthShort(m)}</td>
                      <td class="num income mono">${formatTHB(d.income)}</td>
                      <td class="num expense mono">${formatTHB(d.expense)}</td>
                      <td class="num ${d.net >= 0 ? 'income' : 'expense'} mono">${formatTHB(d.net)}</td>
                      <td class="num ${sr >= 0 ? 'income' : 'expense'}">${sr}%</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      drawBarChart(months, monthData);
      drawTrendChart(months, savingRates);
    });

    await renderPieSection();
  }

  await render();

  return () => {
    [barChart, pieChart, trendChart].forEach(c => c?.destroy());
    barChart = pieChart = trendChart = null;
  };
}

// ── Charts ────────────────────────────────────────────────────

const PIE_COLORS = ['#18181B','#0D9488','#6366F1','#F59E0B','#EC4899','#3B82F6','#8B5CF6','#64748B'];

function drawBarChart(months, data) {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;
  if (barChart) { barChart.destroy(); barChart = null; }

  barChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => formatMonthShort(m)),
      datasets: [
        {
          label: 'รายรับ',
          data:  data.map(d => d.income / 100),
          backgroundColor: '#CCFBF1',
          borderColor:     '#0D9488',
          borderWidth:     1.5,
          borderRadius:    4,
        },
        {
          label: 'รายจ่าย',
          data:  data.map(d => d.expense / 100),
          backgroundColor: '#FEE2E2',
          borderColor:     '#DC2626',
          borderWidth:     1.5,
          borderRadius:    4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'DM Sans' } } },
        tooltip: { callbacks: { label: ctx => ` ฿${ctx.parsed.y.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'DM Sans', size: 12 } } },
        y: { grid: { color: 'rgba(150, 150, 150, 0.1)' }, ticks: { font: { family: 'DM Mono', size: 11 }, callback: v => '฿' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
      },
    },
  });
}

function drawPieChart(catBreakdown, totalExp) {
  const canvas = document.getElementById('pie-chart');
  if (!canvas) return;
  if (pieChart) { pieChart.destroy(); pieChart = null; }

  const top = catBreakdown.slice(0, 6);
  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: top.map(e => e.cat.name),
      datasets: [{
        data:            top.map(e => e.total / 100),
        backgroundColor: PIE_COLORS.slice(0, top.length),
        borderWidth:     2,
        borderColor:     document.documentElement.dataset.theme === 'dark' ? '#121215' : '#ffffff',
        hoverOffset:     4,
      }],
    },
    options: {
      cutout:   '68%',
      plugins:  {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = totalExp > 0 ? Math.round((ctx.parsed / (totalExp / 100)) * 100) : 0;
              return ` ฿${ctx.parsed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}  (${pct}%)`;
            },
          },
        },
      },
      animation: { duration: 350 },
    },
  });
}

function drawTrendChart(months, savingRates) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  if (trendChart) { trendChart.destroy(); trendChart = null; }

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months.map(m => formatMonthShort(m)),
      datasets: [{
        label: 'อัตราออม (%)',
        data:  savingRates,
        borderColor:     '#0D9488',
        backgroundColor: 'rgba(13,148,136,0.08)',
        borderWidth:     2,
        pointRadius:     4,
        pointBackgroundColor: '#0D9488',
        tension:         0.35,
        fill:            true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y}%` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'DM Sans', size: 12 } } },
        y: { grid: { color: 'rgba(150, 150, 150, 0.1)' }, ticks: { font: { family: 'DM Mono', size: 11 }, callback: v => v + '%' } },
      },
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────

function last6Months(endMonth) {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const [y, m] = endMonth.split('-').map(Number);
    const d = new Date(y, m - 1 - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}
