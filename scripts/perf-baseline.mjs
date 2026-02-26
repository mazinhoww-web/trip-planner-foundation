import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

const enforce = String(process.env.PERF_ENFORCE || 'false').toLowerCase() === 'true';
const mainJsGzipBudget = Number(process.env.PERF_MAIN_JS_GZIP_BUDGET || 500000);
const totalJsGzipBudget = Number(process.env.PERF_TOTAL_JS_GZIP_BUDGET || 800000);
const totalCssGzipBudget = Number(process.env.PERF_TOTAL_CSS_GZIP_BUDGET || 200000);

if (!fs.existsSync(assetsDir)) {
  console.error(`[perf] Diretório não encontrado: ${assetsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const jsFiles = files.filter((file) => file.endsWith('.js'));
const cssFiles = files.filter((file) => file.endsWith('.css'));

const asStats = (fileName) => {
  const fullPath = path.join(assetsDir, fileName);
  const content = fs.readFileSync(fullPath);
  return {
    fileName,
    rawBytes: content.length,
    gzipBytes: gzipSync(content).length,
  };
};

const jsStats = jsFiles.map(asStats);
const cssStats = cssFiles.map(asStats);

const largestJs = jsStats.reduce((acc, current) => (acc == null || current.gzipBytes > acc.gzipBytes ? current : acc), null);
const totalJsGzip = jsStats.reduce((sum, item) => sum + item.gzipBytes, 0);
const totalCssGzip = cssStats.reduce((sum, item) => sum + item.gzipBytes, 0);

const baseline = {
  generatedAt: new Date().toISOString(),
  enforce,
  budgets: {
    mainJsGzipBudget,
    totalJsGzipBudget,
    totalCssGzipBudget,
  },
  largestJs,
  totals: {
    jsFiles: jsFiles.length,
    cssFiles: cssFiles.length,
    totalJsGzip,
    totalCssGzip,
  },
  files: {
    js: jsStats,
    css: cssStats,
  },
};

const baselinePath = path.join(distDir, 'perf-baseline.json');
fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

const messages = [];
if (largestJs && largestJs.gzipBytes > mainJsGzipBudget) {
  messages.push(
    `[perf] Largest JS chunk acima do budget: ${largestJs.fileName} (${largestJs.gzipBytes} > ${mainJsGzipBudget})`,
  );
}
if (totalJsGzip > totalJsGzipBudget) {
  messages.push(`[perf] Total JS gzip acima do budget: ${totalJsGzip} > ${totalJsGzipBudget}`);
}
if (totalCssGzip > totalCssGzipBudget) {
  messages.push(`[perf] Total CSS gzip acima do budget: ${totalCssGzip} > ${totalCssGzipBudget}`);
}

console.log('[perf] Baseline salvo em:', baselinePath);
console.log(
  '[perf] Resumo:',
  JSON.stringify(
    {
      largestJs: largestJs
        ? {
            fileName: largestJs.fileName,
            gzipBytes: largestJs.gzipBytes,
          }
        : null,
      totalJsGzip,
      totalCssGzip,
      enforce,
    },
    null,
    2,
  ),
);

if (process.env.GITHUB_STEP_SUMMARY) {
  const summaryLines = [
    '## Performance baseline',
    '',
    `- Largest JS (gzip): ${largestJs ? `${largestJs.fileName} (${largestJs.gzipBytes} bytes)` : 'N/A'}`,
    `- Total JS (gzip): ${totalJsGzip} bytes`,
    `- Total CSS (gzip): ${totalCssGzip} bytes`,
    `- Budget mode: ${enforce ? 'enforced' : 'report-only'}`,
  ];
  if (messages.length > 0) {
    summaryLines.push('', '### Budget warnings');
    for (const message of messages) {
      summaryLines.push(`- ${message}`);
    }
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join('\n')}\n`);
}

if (messages.length > 0) {
  for (const message of messages) {
    console.warn(message);
  }
  if (enforce) {
    process.exit(1);
  }
}
