# Photo placement: Sonnet 5.5 vs Opus 5.5 (2026-11-27)

10 leads, built twice from the **same** scraped input (one `--prepare`, then `--finish` once per model, direct calls, effort low). Built in scratch copies; nothing in `demos/`, nothing sent or live.

## Per lead

| Lead (trade, photos found) | Hero | Gallery | Logo | Better |
|---|---|---|---|---|
| Sin City Mobile Detailing (boat, 1) | both stock | both none (photo pitch) | both dropped | tie |
| Cumberland Painting (painting, 17) | both #9 (house exterior) | Sonnet 5 photos; Opus 9 (adds #2, #7, #12 fence/yard, #13 commercial) | both dropped | Opus, slightly (fuller; #12 is borderline) |
| MaxCraft Mobile Detailing (boat, 1) | both stock | both none | both kept | tie |
| Next Door Painting (painting, 23) | both #10 (green house, after) | Sonnet 9 incl. #9, the unpaired "before" of #10; Opus 8 without it | both dropped | Opus, slightly |
| Dent Technique (dent, 0) | both stock | both none | both dropped | tie |
| Bryan's Hail & Dent (dent, 6) | both #5 | both none (3 usable) | both dropped | tie |
| Touchstone Detailing (boat, 22) | both #8 (black BMW) | Sonnet 12 (full gallery, all real work); Opus 8 | both dropped | Sonnet (more of their real work) |
| That 1 Painter San Antonio (painting, 24) | Sonnet #21 (staged stock-looking house); Opus none, stock hero | Sonnet 5 staged/marketing photos; Opus none (photo pitch) | both kept | **Opus**: the site's photos are franchise marketing images, and the prompt says leave those out |
| Austin's Lawn Enforcement (lawn, 13) | Sonnet #6 (wide lawn); Opus #2 (lawn with steps) | same 5, different order | both kept | tie |
| Archer's Mobile Detailing (detailing, 13) | both #12 | same set except one photo | both dropped | tie |

No model put a logo, a person or a skyline in a gallery. Neither made a wrong placement worth fixing by hand; the one real miss (That 1 Painter) is Sonnet keeping stock-looking marketing photos. That business is a franchise and should not be pitched anyway: added to the chain list.

## Cost and tokens (same input for both: 106,770 tokens over 10 leads, about 10,700 a lead, mostly the photo thumbnails)

| | Output tokens (10 leads) | Per preview, direct | Per preview, Message Batch |
|---|---|---|---|
| Sonnet 5.5 ($2 / $10 per M) | 11,854 | 3.3 cents | 1.7 cents |
| Opus 5.5 ($4 / $20 per M) | 11,554 | 6.6 cents | 3.3 cents |

At 180 previews a day (5,400 a month), through the Batches API:
- **Everything on Sonnet:** about **$90 a month**.
- **Everything on Opus:** about **$178 a month** (+$88).
- **Photo step only on Opus** (a second, photo-only Opus call next to the Sonnet wording call): the photos are most of the input, so that call costs nearly as much as a full one, about 2.4 cents batched. Total about **$220 a month** (+$130), more than all-Opus. Not worth splitting.

## Verdict

Keep **Sonnet 5.5**. On 10 leads Opus was a little stricter about stock-looking photos and a little fuller in one gallery, Sonnet fuller in another; 6 of 10 were ties. That is not worth twice the price ($88 a month more at 180 a day), and the one Sonnet miss is caught in review (and by the chain list). Sonnet through Batches (~$90/month) fits the $100/month of free credits; Opus would not.
