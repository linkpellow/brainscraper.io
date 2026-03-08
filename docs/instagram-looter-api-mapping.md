# Instagram Looter API – Param & Response Mapping (from MCP calls)

**Source:** RapidAPI Instagram Looter (`instagram-looter2.p.rapidapi.com`). MCP server: `project-0-brainscraper.io-1-RapidAPI Hub - Instagram Looter`. All calls use `RAPIDAPI_KEY` and host `instagram-looter2.p.rapidapi.com`.

---

## 1. User_info_V2_by_username

- **Endpoint:** GET `/profile2`
- **Params:** `username` (required), optional `fields`
- **Response (relevant for LeadListItem):**
  - `full_name` → lead name
  - `username` → profile URL = `https://www.instagram.com/${username}/`
  - `pk` / `id` → user id
  - `city_name` → lead city (when present)
  - `address_street`, `zip` → optional location; parse address for city/state if needed
  - `biography`, `is_private`, `follower_count`, `profile_pic_url` also returned

---

## 2. Search_users_by_keyword

- **Endpoint:** GET `/search`
- **Params:** `query` (required), `select` (required, use `"users"`), optional `fields`
- **Response:**
  - `status`: `"ok"`
  - `users`: array of `{ position, user: { username, full_name, pk, profile_pic_url, is_verified, id } }`
- **LeadListItem mapping:** For each `users[].user`: `name` = `user.full_name || user.username`, `linkedinUrl`-style field can store `https://www.instagram.com/${user.username}/` (e.g. `instagramUrl` or reuse a generic profile URL field).

---

## 3. Media_by_hashtag

- **Endpoint:** GET `/tag-feeds`
- **Params:** `query` (hashtag, required), optional `end_cursor`, optional `fields`
- **Response:** Large; returns feed of media items. Use for “discover posts by hashtag”; then use **Media_info_by_URL** per post URL to get owner and commenters.

---

## 4. Media_info_by_URL

- **Endpoint:** GET `/post`
- **Params:** `url` (required, e.g. `https://www.instagram.com/p/CqIbCzYMi5C/`), optional `fields`
- **Response (relevant for leads):**
  - `owner`: `{ id, username, full_name, profile_pic_url }` → post author (one lead)
  - `edge_media_to_tagged_user.edges[].node.user`: `{ full_name, username, id }` → tagged users (leads)
  - `edge_media_to_parent_comment.edges[].node`: `owner`: `{ id, username }` (no full_name); `text` = comment. For commenter leads, use **username** and optionally call **User_info_V2_by_username** to get full_name and city_name.
- **LeadListItem:** Post owner and tagged users have full_name + username. Commenters: username only unless we fetch profile.

---

## 5. Web_profile_info_by_username

- **Endpoint:** GET `/web-profile`
- **Params:** `username` (required), optional `fields`
- **Response:** Public web profile data; structure may differ from User_info_V2. Use for alternate profile/location source if needed.

---

## Recommended flows for Instagram tab

1. **Search by keyword:** Call **Search_users_by_keyword** with `query` + `select: "users"` → list of users → build LeadListItem from each (name, profile URL, platform: `instagram`). Optionally for each user call **User_info_V2_by_username** to get city_name when “Fetch location” is requested.
2. **Hashtag → posts → commenters:** Call **Media_by_hashtag** with `query` (hashtag) → get media list (extract post URLs); for each post URL call **Media_info_by_URL** → get owner + tagged users + commenters (owner has full_name; commenters have username only — optionally enrich with User_info_V2).
3. **Single profile:** Call **User_info_V2_by_username** with `username` → one lead with name, profile URL, city_name when available.

---

*Document generated from live MCP tool calls; use these shapes for implementation.*
