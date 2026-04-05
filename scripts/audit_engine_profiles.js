#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);

["simulator-db.js", "simulator-engine.js"].forEach((file) => {
  const fullPath = path.join(ROOT, file);
  vm.runInContext(fs.readFileSync(fullPath, "utf8"), context, { filename: file });
});

const Engine = context.FamilyAdvisorEngine;

const profiles = [
  {
    label: "Famiglia in affitto con 2 figli",
    profile: {
      name: "Marco Ferretti",
      age: 42,
      maritalStatus: "Coniugato",
      spouseName: "Giulia",
      childrenCount: 2,
      childrenAges: [8, 5],
      profession: "Ingegnere",
      grossAnnualIncome: 65000,
      monthlySavings: 800,
      totalAssets: 80000,
      housingStatus: "Affittuario",
      residenceCity: "Milano",
      goals: [{ id: "home" }, { id: "education" }, { id: "retirement" }],
    },
  },
  {
    label: "Proprietario con mutuo e 1 figlio",
    profile: {
      name: "Luca Bianchi",
      age: 38,
      maritalStatus: "Coniugato",
      spouseName: "Sara",
      childrenCount: 1,
      childrenAges: [3],
      profession: "Commerciale",
      grossAnnualIncome: 52000,
      monthlySavings: 600,
      totalAssets: 50000,
      housingStatus: "Con mutuo",
      housingCost: 1100,
      residenceCity: "Bologna",
      goals: [{ id: "education" }, { id: "retirement" }],
    },
  },
  {
    label: "Single professionista",
    profile: {
      name: "Giulia Rossi",
      age: 34,
      maritalStatus: "Single",
      childrenCount: 0,
      profession: "Avvocato",
      grossAnnualIncome: 48000,
      monthlySavings: 700,
      totalAssets: 45000,
      housingStatus: "Affittuario",
      residenceCity: "Roma",
      goals: [{ id: "wealth" }, { id: "home" }],
    },
  },
  {
    label: "Pre-pensione proprietario",
    profile: {
      name: "Paolo Verdi",
      age: 57,
      maritalStatus: "Coniugato",
      spouseName: "Anna",
      childrenCount: 0,
      profession: "Imprenditore",
      grossAnnualIncome: 78000,
      monthlySavings: 1200,
      totalAssets: 220000,
      housingStatus: "Proprietario",
      residenceCity: "Torino",
      goals: [{ id: "retirement" }, { id: "wealth" }],
    },
  },
];

function summarizeCase(entry) {
  const plan = Engine.buildPlan(entry.profile);
  const analysis = Engine.analyzeScenarios(plan, {
    totalAssets: plan.profile.totalAssets,
    monthlySavings: plan.profile.monthlySavings,
    horizonYears: 10,
    goalId: plan.goals[0] && plan.goals[0].id,
  });

  return {
    label: entry.label,
    profile: {
      age: plan.profile.age,
      profession: plan.profile.profession,
      housingStatus: plan.profile.housingStatus,
      netMonthlyIncome: plan.profile.netMonthlyIncome,
      totalAssets: plan.profile.totalAssets,
      monthlySavings: plan.profile.monthlySavings,
    },
    goals: plan.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      years: goal.years,
    })),
    selectedCoverageIds: plan.selectedCoverageIds.slice(),
    recommendations: plan.recommendations.map((item) => ({
      id: item.id,
      name: item.name,
      score: item.score,
      monthlyPremium: item.monthlyPremium,
      selfFundMonthlyEquivalent: item.selfFundMonthlyEquivalent,
      scenarioIds: item.scenarioIds,
      selectedByDefault: item.selectedByDefault,
      selectedByDefaultReason: item.selectedByDefaultReason,
    })),
    gauges: analysis.goalGaugeCards.map((goal) => ({
      goalId: goal.goalId,
      goalName: goal.goalName,
      foundationScore: goal.foundationScore,
      noCoverageAchievement: goal.noCoverageAchievement,
      activeAchievement: goal.activeAchievement,
      improvement: goal.improvement,
      scenarioLabel: goal.scenarioLabel,
    })),
  };
}

const report = profiles.map(summarizeCase);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

report.forEach((entry) => {
  console.log(`\n=== ${entry.label} ===`);
  console.log(
    `Profilo: ${entry.profile.age} anni · ${entry.profile.profession} · ${entry.profile.housingStatus} · reddito netto € ${entry.profile.netMonthlyIncome}/mese · patrimonio € ${entry.profile.totalAssets}`
  );
  console.log(
    "Obiettivi: " +
      entry.goals.map((goal) => `${goal.name} (€ ${goal.targetAmount}, ${goal.years} anni)`).join(" | ")
  );
  console.log("Coperture default: " + (entry.selectedCoverageIds.join(", ") || "(nessuna)"));
  console.log("Raccomandazioni:");
  entry.recommendations.forEach((recommendation) => {
    console.log(
      ` - ${recommendation.id}: score ${recommendation.score}, premio € ${recommendation.monthlyPremium}/mese, self-fund € ${recommendation.selfFundMonthlyEquivalent}/mese, default ${recommendation.selectedByDefault ? "si" : "no"}${recommendation.selectedByDefaultReason ? " · " + recommendation.selectedByDefaultReason : ""}`
    );
  });
  console.log("Gauge:");
  entry.gauges.forEach((goal) => {
    console.log(
      ` - ${goal.goalName}: base ${goal.foundationScore}/100, senza ${goal.noCoverageAchievement}/100, con default ${goal.activeAchievement}/100, delta ${goal.improvement}, scenario ${goal.scenarioLabel}`
    );
  });
});
