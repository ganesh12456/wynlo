# Business storyboard and responsive experience

## Product promise

A procurement analyst needs to explain what the next-day wind outlook looked like at a specific decision time, which publication supported it, what changed by a later cutoff, and how recorded output later differed. The interface should make that chain understandable without requiring the customer to know the API model.

## Main customer journey

| Scene | User intent | Interface and action | Business outcome |
| --- | --- | --- | --- |
| 1. Orientation | Understand the portal immediately | Quiet turbine illustration, UK wind scope and a historical pilot label | A clear national wind decision-support context |
| 2. Set the decision | Reconstruct the information available then | Date, explicit London cutoff and next-day delivery confirmation; deliberate Update outlook action | An unambiguous as-of scenario |
| 3. Read the outlook | Understand the delivery-day shape | Average/peak forecast, hourly profile, accessible point inspection and availability count | A concise view of timing and magnitude |
| 4. Challenge the assumption | Understand publication timing | Compare an earlier and later cutoff with exact hourly changes | The analyst can explain how waiting changed available information |
| 5. Check the evidence | Verify the source of a displayed value | Open hourly publication trace; inspect timestamp and age; download CSV | A traceable review record |
| 6. Prepare the review | Communicate the selected outlook | Decision brief, reviewer notes, browser print/save PDF and evidence download | A clear handoff for human review |
| 7. Learn after delivery | Examine the historical comparison | Performance review with MAE, RMSE, signed difference, daily/hourly breakdowns and matched coverage | A qualified retrospective view with assumptions visible |

## Secondary reviewer journey

Open **Data & methodology** → inspect sources and record counts → review the cutoff-selection rule → understand interval alignment and population limits → inspect snapshot ID and hashes. The reviewer can then return to the same decision context; navigating between views retains the selected decision date and time.

## Design system

- Deep teal anchors identity and primary actions. Ivory provides the working surface. Sea-glass greens distinguish source context, forecast marks and prepared review states. Warm sand marks retrospective caveats and the second chart series.
- The delivery-day profile is the main analytical object. A contextual brief sits beside it at wide widths and below it on narrow screens. There are no decorative KPI totals or unimplemented operational claims.
- Headings identify tasks and outcomes. Labels define MW/GW, London time, decision versus delivery date, matched-hour denominators and source availability.
- Publication comparison and performance review are deliberately distinct: the former compares two as-of forecasts; the latter can use later actual generation.

## Responsive behavior

- Wide desktop: persistent navigation, full operational workspace, chart and brief side by side.
- Tablet: collapsible navigation, full-width chart, brief reflowed below it, two-column supporting content.
- Phone: compact hero, stacked decision controls and delivery confirmation, single-column cards, horizontal scrolling confined to exact-value tables and the 24-hour bar chart.
- Accessibility: native labeled inputs, semantic navigation, tab selection states, visible keyboard focus, reduced-motion support, keyboard-inspectable chart points, native modal dialog with focus containment and explicit title, and a skip link. The closed mobile sidebar is invisible to accessibility navigation; the main canvas is inert while navigation is open.

## Verification criteria

1. An analyst can set a valid decision date/time, see the following delivery day and inspect the exact available values.
2. Changing the draft controls does not relabel already displayed results; they update only after submitting the scenario.
3. The default server response excludes actual generation. Revealing actuals is an explicit choice, with a visible retrospective explanation.
4. Invalid dates or reversed cutoff/range inputs produce actionable errors rather than fabricated output.
5. Source exports reflect the selected scenario and retain its publication context.
6. The brief prints independently of the surrounding workspace.
7. The page remains usable at phone, tablet and desktop widths; exact-value tables can scroll within their own containers.
8. Source-population and business-scope limitations remain visible where they affect interpretation.
