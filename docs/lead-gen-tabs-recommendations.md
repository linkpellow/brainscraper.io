# Lead Gen Tabs: Facebook & Instagram – Recommendations

**Last updated:** 2026-03-08

## Cross‑tab consistency

- **Styling:** Use the same panel/error patterns as the LinkedIn tab where possible (e.g. `panel-inactive`, `field-inactive`, error panel with red border) so all three tabs feel like one flow.
- **Feedback:** Replace `alert()` with inline success messages or a small toast so the user can keep context (e.g. “Added 12 leads” under the button for 3s then fade). Optional: shared toast hook if you add one elsewhere.
- **Deduplication:** When adding to the shared list, avoid re-adding leads that are already in the list. Facebook dedupes within its local batch (e.g. by name); Instagram can dedupe by `instagramUrl` if the parent passes existing URLs. Parent can pass `existingInstagramUrls={new Set(leadList.map(l => l.instagramUrl).filter(Boolean))}` so “Add to Lead List” only adds new handles.

---

## Facebook tab

- **Empty states:** When “Search posts” returns 0 posts, show a short hint: “No posts found. Try another keyword or search in a different region.”
- **Rate limits:** If the Facebook API returns 429 or a rate-limit message, show a clear message and suggest waiting or reducing scope (e.g. fewer posts per keyword in Automated).
- **Fetch location:** Show how many commenters have a profile URL before “Fetch location” (e.g. “Fetch location (12 with profile)”) so the user knows what to expect.
- **New search:** Keep “New search” visible in the results view; consider a sticky header so it’s always available when scrolling long post/comment lists.

---

## Instagram tab

- **Empty state:** After a search or hashtag load, if the API returns 0 users, show: “No users found. Try a different keyword or hashtag.” so the user knows the run completed.
- **Clear / New search:** Provide “Clear results” or “New search” to reset the user list and error so the user can run another keyword or hashtag without confusion.
- **Profile links:** In the user list, make the username (or name) a link that opens the Instagram profile in a new tab (`instagramUrl`).
- **Deduplication:** When adding to the shared list, skip users whose `instagramUrl` is already in the parent lead list (parent passes `existingInstagramUrls`).
- **Progress for hashtag:** “Load posts & commenters” can be slow (multiple post_info calls). Consider a progress line or “Loading post 3 of 8…” so the user knows it’s working.
- **Limits:** Make “posts to scan” (e.g. 8) and “commenters per post” (e.g. 20) configurable via small inputs so power users can tune cost vs. coverage.
- **Rate limits:** Instagram Looter can rate-limit. On 429 or similar, show a clear message and optionally a “Retry after 1 min” button.

---

## Optional (both)

- **Export from tab:** “Export this batch” (CSV of current results only) before adding to the main list, for spot checks.
- **Saved searches:** Persist last-used keyword/hashtag (or a small list) in `localStorage` so returning users can repeat searches quickly.
