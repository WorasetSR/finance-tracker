// ─────────────────────────────────────────────────────────────
//  pages/analytics.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonthShort, thaiMonthNames } from '../format.js';
import { currentMonth } from '../schema.js';

let barChart    = null;
let pieChart    = null;
let trendChart  = null;

export async function initAnalytics(container, store) {
  const endMonth  = currentMonth();
  const months    = last6Months(endMonth);
  let catMonth    = endMonth;   // Month shown in category breakdown

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
          <h2 class="card-title">รายจ่ายตามหมวด</h2>
          <div class="cat-month-nav">
            <button class="icon-btn" id="cat-prev-month" title="เดือนก่อน">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="cat-month-label">${formatMonthShort(catMonth)}</span>
            <button class="icon-btn" id="cat-next-month" title="เดือนถัดไป">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
        ${catBreakdown.length > 0 ? `
          <div class="chart-wrap chart-wrap-donut">
            <canvas id="pie-chart"></canvas>
          </div>
          <div class="cat-legend">
            ${catBreakdown.slice(0, 6).map((e, i) => {
              const pct = totalExp > 0 ? Math.round((e.total / totalExp) * 100) : 0;
              return `
                <div class="legend-item">
                  <span class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
                  <span class="legend-label">${e.cat.icon || ''} ${e.cat.name}</span>
                  <span class="legend-pct">${pct}%</span>
                  <span class="legend-value mono">${formatTHB(e.total)}</span>
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

    const savingRates = monthData.map(d => d.income > 0 ? Math.round((d.net / d.income) * 100) : 0);

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">วิเคราะห์</h1>
        <span class="page-subtitle">${formatMonthShort(months[0])} – ${formatMonthShort(endMonth)}</span>
      </div>

      <div class="page-body">
        <!-- Income vs Expense bar chart -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">รายรับ vs รายจ่าย</h2>
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
              <h2 class="card-title">อัตราออม</h2>
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

const PIE_COLORS = ['#0D9488','#14B8A6','#2DD4BF','#5EEAD4','#6366F1','#8B5CF6','#EC4899','#F59E0B'];

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
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { family: 'DM Mono', size: 11 }, callback: v => '฿' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
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
        borderColor:     '#fff',
        hoverOffset:     4,
      }],
    },
    options: {
      cutout:   '65%',
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
      animation: { duration: 400 },
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
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { family: 'DM Mono', size: 11 }, callback: v => v + '%' } },
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
