// Realistic, messy meeting transcript for the "Try sample notes" button.
// Deadlines are relative ("by Friday") so they resolve against today's date.
export const SAMPLE_NOTES = `Elm St Pump Station Retrofit - 60% design review
attendees: Maria Chen (PM), Dev Patel (electrical), Sam Okafor (mechanical), Priya Shah (controls), Tom Reyes (city ops) - Jen from structural dialed in late

Maria: ok let's start, we're behind on the 60% package so lets keep this tight

Pumps / VFDs
- Sam walked thru the 3 options again. soft starters cheapest upfront but Tom says ops hates them, the old station had 2 failures last yr
- Dev: VFDs add maybe 40k but energy model shows payback ~6 yrs
- DECIDED: going w/ VFDs on all 3 pumps. Maria to note it in the design memo
- Sam still needs the updated pump curves from Xylem before he can size the discharge header. he emailed them last week, no reply. Sam will call the rep tomorrow

Electrical
- Dev has the one-line about 80% done. needs final VFD heat loads from the vendor. Dev to finish the one-line by Friday
- Tom asked if the existing MCC can be reused -> Dev said no, it's 1987 vintage and doesn't have room. new MCC it is
- utility service upgrade? nobody has called the power company yet. someone needs to submit the service request, could take 8-10 wks (didn't decide who)

Controls
- Priya drafting SCADA tag list, will follow the city's tag standard
- question from Priya: does the city want the new PLC on the existing radio network or fiber? Tom wasn't sure, will check with IT
- Priya to have the draft tag list ready for review next Wednesday

Structural (Jen)
- wet well concrete looks fine per the condition assessment, keep it. Jen will send the report to Maria by end of week
- new hatch openings might need to be re-checked for the bigger pumps, Jen not sure yet

Schedule / risks
- Sam: pump lead times are 16-20 weeks right now. if we don't order by Dec we miss the low-flow window in spring
- bypass pumping during cutover isn't in the budget. Maria thinks it's 25-30k minimum. need a quote
- Tom mentioned the neighbors complained about generator noise last time. might need a noise permit for the temp generator?? nobody knew

Misc
- next design review in 2 weeks, same time
- Q: is the 60% submittal due to the city on the 15th or the 30th? -> Maria confirmed it's the 30th

Action recap (Maria):
Sam - call Xylem rep tomorrow, pump curves
Dev - one-line by Fri
Priya - tag list draft next Wed
Jen - structural report to Maria by end of week
Maria - update design memo w/ VFD decision, get bypass pumping quote
`;
