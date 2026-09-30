// Downloads the raw source files into data/raw. Run monthly (Zillow updates mid-month).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW = join(import.meta.dirname, "..", "data", "raw");

const SOURCES: Record<string, string> = {
  "zhvi_zip.csv":
    "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  "zhvi_zip_bottom.csv":
    "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_sm_sa_month.csv",
  "zhvi_zip_top.csv":
    "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_sm_sa_month.csv",
  "zori_zip.csv":
    "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv",
  "zhvi_county.csv":
    "https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  "zhvf_zip.csv":
    "https://files.zillowstatic.com/research/public_csvs/zhvf_growth/Zip_zhvf_growth_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  "mortgage30.csv": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US",
  "cpi.csv": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL",
};

mkdirSync(RAW, { recursive: true });
for (const [file, url] of Object.entries(SOURCES)) {
  process.stdout.write(`Downloading ${file} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(RAW, file), buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}
