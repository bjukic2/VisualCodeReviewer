"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Issue {
  type: string;
}
interface HistoryItem {
  issues: Issue[];
  createdAt: string;
}

export default function Dashboard() {
  const [data, setData] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/review");
        const json = await res.json();
        if (json.success) setData(json.history);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Agregacija podataka za grafove
  const issueCounts = { security: 0, bug: 0, style: 0, performance: 0 };
  let totalIssues = 0;

  data.forEach((review) => {
    review.issues.forEach((issue) => {
      totalIssues++;
      if (issue.type in issueCounts) {
        issueCounts[issue.type as keyof typeof issueCounts]++;
      }
    });
  });

  const barData = Object.keys(issueCounts).map((key) => ({
    name: key.toUpperCase(),
    count: issueCounts[key as keyof typeof issueCounts],
  }));

  const COLORS = ["#ef4444", "#f59e0b", "#6b7280", "#3b82f6"]; // Red, Amber, Gray, Blue

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Analytics Dashboard
            </h1>
            <p className="text-gray-400">
              Overview of code quality and historical analysis
            </p>
          </div>
          <Link
            href="/"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition border border-gray-700"
          >
            ← Back to IDE
          </Link>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 mt-20">
            Loading statistics...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Stat Cards */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="text-gray-400 text-sm font-semibold uppercase">
                Total Reviews
              </h3>
              <p className="text-4xl font-bold text-white mt-2">
                {data.length}
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="text-gray-400 text-sm font-semibold uppercase">
                Total Issues Found
              </h3>
              <p className="text-4xl font-bold text-indigo-400 mt-2">
                {totalIssues}
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="text-gray-400 text-sm font-semibold uppercase">
                Avg Issues / Review
              </h3>
              <p className="text-4xl font-bold text-emerald-400 mt-2">
                {data.length ? (totalIssues / data.length).toFixed(1) : 0}
              </p>
            </div>

            {/* Bar Chart */}
            <div className="md:col-span-2 bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="text-gray-200 text-lg font-bold mb-6">
                Issue Distribution (Bar)
              </h3>
              <div className="h-75 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <XAxis
                      dataKey="name"
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#1f2937" }}
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-sm flex flex-col">
              <h3 className="text-gray-200 text-lg font-bold mb-2">
                Proportion (Pie)
              </h3>
              <div className="flex-1 min-h-62.5 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={barData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {barData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111827",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
