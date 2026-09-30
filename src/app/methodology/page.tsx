import type { Metadata } from "next";
import { calibration } from "@/lib/defaults";
import { pct } from "@/lib/format";

export const metadata: Metadata = { title: "Methodology · Property Wealth Projector" };

type Metric = (typeof calibration.metrics)[number];

function MetricTable({ rows }: { rows: Metric[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Model</th>
            <th className="py-2 pr-3 text-right font-medium">Horizon</th>
            <th className="py-2 pr-3 text-right font-medium">Avg error</th>
            <th className="py-2 pr-3 text-right font-medium">Bias</th>
            <th className="py-2 text-right font-medium">Beats flat 5%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isModel = m.model.startsWith("Trend");
            return (
              <tr key={m.model + m.h} className={`border-b border-line/60 ${isModel ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-3">{m.model}</td>
                <td className="py-1.5 pr-3 text-right">{m.h} yr</td>
                <td className="py-1.5 pr-3 text-right">{pct(m.mae)}</td>
                <td className="py-1.5 pr-3 text-right">{m.bias >= 0 ? "+" : ""}{pct(m.bias)}</td>
                <td className="py-1.5 text-right">{m.model.startsWith("Flat") ? "–" : pct(m.beatsFlat, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export default function Methodology() {
  const c = calibration;
  const p = c.params;
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-3xl font-semibold">How the projection works</h1>
        <p className="mt-2 text-ink-2">
          A transparent, tested model: local momentum that fades toward a long-run rate, an interest-rate adjustment, and
          an uncertainty range calibrated on past outcomes.
        </p>
      </div>

      <Section title="1. The formula">
        <p>For each future year <em>t</em>, expected growth is:</p>
        <pre className="overflow-x-auto rounded-lg bg-card-2 p-4 font-mono text-sm text-ink">
{`g(t) = L + (M − L) · e^(−(t − ½) / τ)

M  = momentum  = w · (last 12 months) + (1 − w) · (5-yr trend)
L  = long-run  = inflation + real premium   (or the ZIP's own ≤20-yr CAGR, or a blend)
τ  = fade time: how fast hot or cold markets revert

Rate effect (level shift, phased in):  ln P  +=  β · (target rate − today's rate)
Range at year t:  median × exp(z · k · σ · t^a)   for t ≤ 5 (calibrated)
                  … then widens with √t beyond 5 years
σ = ZIP's historical volatility of annual changes`}
        </pre>
        <p>
          The 5-year trend is a least-squares fit through the log of 61 monthly index values, which is less sensitive to
          a single peak or trough month than an endpoint CAGR. The scenario slider picks <em>z</em>: the 10th percentile
          is z = −1.28, the median is 0 and the 90th percentile is +1.28.
        </p>
        <p>
          The model reflects two well-documented features of housing markets. Prices have <strong>short-run momentum</strong>{" "}
          (Case &amp; Shiller, 1989) and <strong>mean-revert</strong> over roughly five years or more (Glaeser, Gyourko, Morales &amp;
          Nathanson, 2014).
        </p>
      </Section>

      <Section title="2. Data">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Zillow Home Value Index (ZHVI)</strong>: monthly, by ZIP, 2000–{c.dataThrough}; mid-tier homes, smoothed and seasonally adjusted. ZIPs with less than 5 years of history fall back to their county.</li>
          <li>
            <strong>Zillow ZHVI price tiers</strong> (lower, middle and upper third of homes in each ZIP). The trend comes
            from the tier whose typical value is closest to the property&apos;s, so a $1.9M home in a $1.3M ZIP follows
            the upper third of the market. The backtest calibrated the model on the middle tier.
          </li>
          <li><strong>RentCast</strong>: property-level value estimate for a street address (capped at the free monthly quota).</li>
          <li><strong>Zillow Home Value Forecast</strong>: optional year-1 override.</li>
          <li><strong>Freddie Mac 30-yr mortgage rate</strong> and <strong>CPI</strong> from FRED.</li>
          <li><strong>US Census geocoder</strong>: address → ZIP and county.</li>
        </ul>
        <p>
          The index describes the <em>typical</em> home in the area. Applying it to one property assumes that home tracks
          its market, which is the same assumption FHFA&apos;s house-price calculator makes.
        </p>
      </Section>

      <Section title="3. Backtest">
        <p>
          {c.method}. That&apos;s {c.nOutOfSample.toLocaleString()} out-of-sample ZIP forecasts, each made using only data
          available at the time. &quot;Avg error&quot; is the mean absolute error of the forecast value (≈ %). &quot;Beats flat 5%&quot;
          is the share of forecasts closer to the outcome than a flat 5%/yr.
        </p>
        <MetricTable rows={c.metrics} />
        <h3 className="pt-2 font-semibold text-ink">By era: trend model vs flat 5%</h3>
        {c.eras.map((e) => (
          <div key={e.label}>
            <div className="mb-1 text-sm font-medium text-ink">{e.label}</div>
            <MetricTable rows={e.metrics} />
          </div>
        ))}
        <h3 className="pt-2 font-semibold text-ink">What this shows</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Over 1 year, local trend beats a flat rate.</strong> It also beats it by a wide margin in downturns
            (2008–11), which is when a flat 5% is most dangerous.
          </li>
          <li>
            <strong>Over 3–5 years, the long-run rate matters most, and it is hard to forecast.</strong> Flat 5% scored well
            from 2012–2025 because U.S. home prices happened to average roughly 5%/yr then. In the 2008–11 bust it was
            badly wrong. That is why the long-run anchor is an adjustable assumption and the range is shown, not hidden.
          </li>
          <li>
            <strong>The range is honest.</strong> The 10th–90th percentile band captured{" "}
            {c.coverage.map((x) => `${pct(x.coverage, 0)} (${x.h} yr)`).join(", ")} of out-of-sample outcomes against an
            80% target.
          </li>
        </ul>
      </Section>

      <Section title="4. Default settings">
        <ul className="list-disc space-y-1 pl-5">
          <li>Momentum weight on last 12 months: <strong>{Math.round(p.momentumWeight * 100)}%</strong>; fade time <strong>{p.fadeYears} yr</strong>. The backtest chose these in every year it was refitted.</li>
          <li>Range: <strong>{p.bandScale.toFixed(2)} × σ × years^{p.bandExponent.toFixed(2)}</strong>, fitted to out-of-sample errors.</li>
          <li>
            Long-run growth: <strong>inflation 2.5% + 1.0% real</strong>. The backtest&apos;s latest fit was inflation +{" "}
            {pct(p.realPremium)}, but that fit is pulled up by the 2020–22 boom. Century-long studies put real home-price
            growth near 0–1.5%/yr (Shiller, <em>Irrational Exuberance</em>; Knoll, Schularick &amp; Steger, 2017; Jordà et al.,{" "}
            <em>The Rate of Return on Everything</em>, 2019).
          </li>
          <li>
            Rate sensitivity: <strong>−3% per +1 pt</strong> in mortgage rates. The user-cost model (Himmelberg, Mayer &amp; Sinai,
            2005) implies large effects. Glaeser, Gottlieb &amp; Gyourko (2010) found actual effects are much smaller. In our
            data, rates and prices rose together in 2021–22, so the regression gives the wrong sign (
            {pct(c.rateBeta.all)} per pt). That means the effect can&apos;t be fitted from this data, so it is a stated
            assumption you can change.
          </li>
        </ul>
      </Section>

      <Section title="5. Risk, cash flow and keep vs. sell">
        <p>
          <strong>Monte Carlo.</strong> 2,000 simulated yearly paths. The log value at year <em>t</em> is the median path
          plus sd(t) × W(t), where sd(t) is the calibrated band and W is a persistent (autocorrelated) shock. Forecast
          errors in housing persist, which is why the band widens almost linearly at first. The persistence is set so each
          simulated year moves about as much as the ZIP historically has (its volatility σ), and the simulated
          10th/50th/90th percentiles match the shaded range at every horizon. The paths then answer
          questions the band can&apos;t: the chance of beating a flat rate, ending below today&apos;s value, a 20%+ drop along
          the way, or owing more than the home is worth. Only year-end values are simulated, so dips within a year are
          missed.
        </p>
        <p>
          <strong>Cash flow.</strong> Rent (defaulting to Zillow&apos;s ZIP rent index and its 5-year trend) minus vacancy,
          management, property tax, insurance, HOA and maintenance gives net operating income. Subtracting the mortgage
          payment gives cash flow. For a home you live in, &quot;rent&quot; is what you&apos;d pay to live elsewhere, so the
          result is the net cost of owning.
        </p>
        <p>
          <strong>Keep vs. sell.</strong> Keeping = equity after selling costs + all cash flows invested at the alternative
          return. Selling = today&apos;s net proceeds invested at that return. The break-even return is the rate at which
          the two end equal, the same &quot;what-if&quot; InsMark Wealthy and Wise+ runs, but with the property on its
          ZIP&apos;s trend. Income taxes, depreciation, capital-gains tax and the home-sale exclusion are not modeled.
        </p>
      </Section>

      <Section title="6. Limitations">
        <ul className="list-disc space-y-1 pl-5">
          <li>Not an appraisal: condition, renovations, lot and micro-location aren&apos;t modeled.</li>
          <li>ZHVI is smoothed, so turning points show up a few months late.</li>
          <li>The range reflects each ZIP&apos;s past volatility; truly new regimes can exceed it.</li>
          <li>Forecasts are nominal (not inflation-adjusted) and exclude rent, taxes, insurance and maintenance.</li>
        </ul>
      </Section>
    </div>
  );
}
