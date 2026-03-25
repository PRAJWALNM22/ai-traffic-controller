import React, { useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * MetricsChart — Live Chart.js line chart showing wait time and throughput trends.
 */
export default function MetricsChart({ waitTimeHistory, throughputHistory }) {
  const chartRef = useRef(null);

  const labels = waitTimeHistory.map((_, i) => `C${i + 1}`);

  const data = {
    labels,
    datasets: [
      {
        label: 'Avg Wait Time (s)',
        data: waitTimeHistory,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#ef4444',
      },
      {
        label: 'Throughput (veh/min)',
        data: throughputHistory,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#22c55e',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#9ca3af',
          font: { size: 11, family: 'Inter, sans-serif' },
          boxWidth: 12,
        },
      },
      title: {
        display: true,
        text: 'Live Signal Performance',
        color: '#e5e7eb',
        font: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#6b7280', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#6b7280', font: { size: 10 } },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="metrics-chart">
      <div style={{ height: 220 }}>
        <Line ref={chartRef} data={data} options={options} />
      </div>
    </div>
  );
}
