# Forkful requirements

Every requirement from `docs/Forkful_SRS_v1.9.docx` in one list, for quick reference. Progress is tracked on the project board: put the requirement IDs on each card.

The SRS is the full source; the wording here is shortened in places. If the two disagree, the SRS wins.

## Functional requirements

### 1. Public catalog browsing and search (High)

- **REQ-1.1** Display public catalog recipes in a paginated list of 20 per page.
- **REQ-1.2** Rank search results by relevance to the query and return them within the time limit in NFR-1.
- **REQ-1.3** Allow visitors to filter catalog results by cuisine and tags.
- **REQ-1.4** Display each catalog recipe’s title and its source site.
- **REQ-1.5** Display a recipe detail page with the recipe’s compressed photo (if it has one), title, ingredients, steps, source site name and link, and a “Save a Copy” button.
- **REQ-1.6** Allow users to sort catalog results by relevance, newest, and title (A–Z).
- **REQ-1.7** Show a “No recipes match your search” message with a suggestion to remove filters when a search returns no results.
- **REQ-1.8** Exclude private recipes and saved copies from all catalog results (BR-2).
- **REQ-1.9** Show each recipe’s thumbnail in catalog results; a recipe without a photo shows a placeholder image.
- **REQ-1.10** Load the starting catalog of 100 to 500 recipes from a seed file the team prepares, using photos the team owns or that are freely licensed (BR-12).
- **REQ-1.11** Show a servings control on every recipe detail page, in the catalog and the Library, that recalculates every ingredient quantity on screen without changing the stored recipe.
- **REQ-1.12** Show scaled US amounts as common kitchen fractions (1/8, 1/4, 1/3, 1/2, 2/3, 3/4) and scaled metric amounts as whole grams or milliliters (one decimal place below 10).
- **REQ-1.13** Leave ingredient lines without a quantity (for example, “salt to taste”) unchanged, and round countable items such as eggs to the nearest whole number with a note that the amount was rounded.
- **REQ-1.14** Allow a logged-in user to keep a scaled version: as a new saved copy for a catalog recipe, or by updating their own recipe after confirmation. A new copy counts toward the 100-recipe limit (BR-10).
- **REQ-1.15** Provide a US/metric toggle on every recipe detail page that converts quantities for display only; logged-in users start from their profile preference (REQ-7.8).
- **REQ-1.16** Convert within the same kind of measure only: tsp, tbsp, fl oz, cup, pint, quart, and gallon to and from mL and L; oz and lb to and from g and kg; and °F to and from °C for oven temperatures written as a number followed by °F or °C in the steps. Units with no conversion, such as pinch, clove, or can, stay as entered.

### 2. Save and edit a copy of a public recipe (High)

- **REQ-2.1** Create a new recipe record owned by the user when saving a copy, leaving the catalog record unmodified.
- **REQ-2.2** Allow the user to edit any field of a saved copy.
- **REQ-2.3** Display a “Modified” indicator on any saved copy whose fields differ from the catalog original.
- **REQ-2.4** If the catalog recipe is no longer available when “Save a Copy” is clicked, show “Recipe not found/unavailable” and create no record.
- **REQ-2.5** If the user already has a copy of the same catalog recipe, tell them and offer to open the existing copy or save another copy.
- **REQ-2.6** Keep saved copies when the catalog original is changed or removed, and show “Original updated” or “Original no longer available” on the copy.
- **REQ-2.7** Block “Save a Copy” when the user already has 100 recipes in their Library, and show “Your Library is full (100 of 100 recipes)” and suggest deleting recipes.
- **REQ-2.8** Show the catalog recipe’s photo on a new saved copy, and let the user replace it with their own dish photo.

### 3. Add a private recipe manually (High)

- **REQ-3.1** Allow a logged-in user to create a private recipe with title, ingredients, steps, and optional tags.
- **REQ-3.2** Make every private recipe visible only to its owner.
- **REQ-3.3** Require a title, at least one ingredient, and at least one step before saving, and highlight each missing field.
- **REQ-3.4** Allow optional fields: description, servings, prep time, cook time, cuisine, a dish photo, and notes.
- **REQ-3.5** Ask for confirmation before discarding unsaved entries when the user cancels.
- **REQ-3.6** Block “New Private Recipe” when the user already has 100 recipes, and show “Your Library is full (100 of 100 recipes)” and suggest deleting recipes.
- **REQ-3.7** Accept a JPG or PNG dish photo up to 10 MB, and compress it in the browser before upload into a display version (at most 1,200 px wide and 100 KB) and a thumbnail (at most 400 px wide and 20 KB), both WebP.
- **REQ-3.8** Delete a recipe’s stored photo when the recipe is permanently deleted or the photo is replaced.
- **REQ-3.9** Store each ingredient line as a quantity, unit, name, and note; the form gives separate quantity and unit fields, with the unit chosen from a list.

### 4. Scan a recipe via OCR (High)

- **REQ-4.1** Accept JPG, PNG, and PDF scans up to 10 MB for OCR, only while the user is adding a recipe.
- **REQ-4.2** Run OCR and return extracted text within 15 seconds at the 90th percentile for a single 300-DPI image on a typical laptop or phone (NFR-2).
- **REQ-4.3** Display the OCR text in an editable field with the source image alongside it.
- **REQ-4.4** Save the corrected OCR result as a private recipe owned by the user.
- **REQ-4.5** Reject files that are not JPG, PNG, or PDF, or are larger than 10 MB, before OCR runs, with an error stating the allowed types and size.
- **REQ-4.6** Split the extracted text into title, ingredients, and steps fields and show it as a recipe preview for the user to correct.
- **REQ-4.7** If OCR fails or takes longer than 30 seconds, show an error and let the user retry or switch to manual entry with the image kept for reference.
- **REQ-4.8** Apply the same required-field check as REQ-3.3 before saving a scanned recipe.
- **REQ-4.9** Run OCR in the user’s browser with Tesseract.js, turning up to 5 PDF pages into images with PDF.js first, and never upload the scan to Forkful’s servers.
- **REQ-4.10** Discard the scan from the browser once the recipe is saved or the scan is cancelled.
- **REQ-4.11** Check the 100-recipe limit before starting a scan; if it is reached, show “Your Library is full (100 of 100 recipes)” and suggest deleting recipes.
- **REQ-4.12** Let the user add an optional dish photo before saving, compressed as in REQ-3.7; the scan itself is never kept as the photo.
- **REQ-4.13** Split each ingredient line from OCR into quantity (including fractions such as 1½ and ranges such as 2–3), unit, name, and note, and show the split in the preview for the user to correct. Lines that cannot be split are kept as plain text and are not scaled or converted.

### 5. Delete recipes (Medium)

- **REQ-5.1** Allow a user to delete any saved copy or private recipe they own.
- **REQ-5.2** Require explicit confirmation before deleting a recipe.
- **REQ-5.3** Deleting a saved copy shall not affect the catalog original.
- **REQ-5.4** Allow the user to select several recipes and delete them with one confirmation.
- **REQ-5.5** Permanently delete recipes and their photos after the confirmation in REQ-5.2.

### 6. Admin account management (Medium)

- **REQ-6.1** Provide System Admin with a console listing every account’s username, email, role, status, and recipe count.
- **REQ-6.2** Allow System Admin to disable and re-enable an account; a disabled account cannot log in, and its recipes are kept.
- **REQ-6.3** Allow System Admin to delete an account after confirmation, removing its data as in REQ-7.5.
- **REQ-6.4** Show System Admin the database and photo storage used against the free limits (0.5 GB and 1 GB), and warn at 80% of either (NFR-8).

### 7. User profiles (Medium)

- **REQ-7.1** Display the user’s username and email on the Profile page.
- **REQ-7.2** Allow the user to change their username and password.
- **REQ-7.3** Send verification link to a new email address, and replace the current one after the link is used.
- **REQ-7.4** Require the current password before changing the email or password.
- **REQ-7.5** Allow a user to delete their own account after explicit confirmation, permanently deleting the account and every saved and private recipe in their library once confirmed.
- **REQ-7.6** Remove a deleted account’s data from the live database immediately and from backups within 7 days.
- **REQ-7.7** Discard a pending email change if the new address is not verified within 24 hours.
- **REQ-7.8** Allow the user to choose US units, metric units, or the original units of each recipe as a profile preference; the default is the original units.

### 8. Account creation (High)

- **REQ-8.1** Allow a guest to create an account with a username, email, and password.
- **REQ-8.2** Reject a username or email already in use, with an error message stating such.
- **REQ-8.3** Require the guest to confirm they are at least 13 years old.
- **REQ-8.4** Send a verification link when the account is created.
- **REQ-8.5** Require passwords of at least 8 characters.
- **REQ-8.6** Expire the verification link after 24 hours and allow the user to request a new one.
- **REQ-8.7** Block login until the email address is verified.
- **REQ-8.8** Delete accounts that are never verified after 7 days.

### 9. Login and authentication (High)

- **REQ-9.1** Allow a verified user to log in with their username or email and password.
- **REQ-9.2** Show one generic message (“Email or password is incorrect”) for any failed login.
- **REQ-9.3** Provide a Log Out button on every page that ends the session.
- **REQ-9.4** End a session after 30 minutes of inactivity (NFR-15).
- **REQ-9.5** Send a single-use password reset link that expires after 1 hour, and end all other sessions once the password is reset.
- **REQ-9.6** Show admin tools only to accounts with the admin role.

### 10. Library view and organization (High)

- **REQ-10.1** List every saved copy and private recipe the user owns, labeled “Saved copy” or “Private,” with the Modified indicator where it applies.
- **REQ-10.2** Allow searching the Library by title, ingredient, and tag.
- **REQ-10.3** Allow sorting the Library by title, date added, and last modified.
- **REQ-10.4** Allow adding and removing user-defined tags on any recipe in the Library.
- **REQ-10.5** Show an empty-Library message with links to the catalog and “New Private Recipe.”
- **REQ-10.6** Show the user how many of their 100 recipes they are using, and warn them when they reach 90.
- **REQ-10.7** Show each recipe’s thumbnail in the Library list; a recipe without a photo shows a placeholder image.

### 11. Catalog curation (Medium)

- **REQ-11.1** Provide a curation dashboard listing failed parses and flagged catalog entries with source URL and error.
- **REQ-11.2** Allow the System Admin to edit any field of a catalog recipe.
- **REQ-11.3** Allow the System Admin to remove a catalog recipe; saved copies of it stay in users’ libraries (BR-6).

### 12. Parse a recipe from a URL (Low)

- **REQ-12.1** Allow System Admin to submit a recipe page URL for import.
- **REQ-12.2** Reject URLs that are malformed, are not recipe pages, or are on sites whose terms or robots.txt disallow parsing, and show the reason.
- **REQ-12.3** If the URL is already in the catalog, show the existing entry instead of adding a duplicate.
- **REQ-12.4** Show the parsed recipe as a preview and add it to the catalog only after the admin confirms.
- **REQ-12.5** Make a newly added recipe appear in catalog search as soon as it is added.
- **REQ-12.6** Read the recipe from the page’s schema.org Recipe (JSON-LD) markup; if the page has none, reject it as not a recipe page.
- **REQ-12.7** Do not copy photos from the source page, since they are usually copyrighted; an imported recipe shows a placeholder until the System Admin adds a photo the team owns or that is freely licensed (BR-12).
- **REQ-12.8** Split imported ingredient lines into quantity, unit, name, and note as in REQ-4.13.

### 13. Cooking mode (Medium)

- **REQ-13.1** Show a “Cooking Mode” button on every recipe detail page.
- **REQ-13.2** Display one step at a time in large text with Next and Previous buttons and an ingredient list the user can open.
- **REQ-13.3** Keep the device screen awake while Cooking mode is active.
- **REQ-13.4** Exit Cooking mode and release the screen lock when the last step is finished, the user exits, the browser tab is switched, or 60 minutes pass.
- **REQ-13.5** If the browser cannot keep the screen awake, stay in Cooking mode and tell the user the screen may sleep.
- **REQ-13.6** Show the servings control and US/metric toggle from REQ-1.11 and REQ-1.15 in Cooking mode.
- **REQ-13.7** Provide a print-friendly view of any recipe. (Low priority)

## Nonfunctional requirements

### Performance

- **NFR-1** Catalog search returns within 4 seconds with up to 10,000 recipes, while serving the users in NFR-6.
- **NFR-2** OCR text returns within 15 seconds (90th percentile) for one 300-DPI image on a typical laptop or phone.
- **NFR-3** Any page loads within 3 seconds (95th percentile) on 5 Mbps; lists load thumbnails (at most 20 KB), not full photos.
- **NFR-4** A recipe save is confirmed within 5 seconds of clicking Save.
- **NFR-5** A full Library of 100 recipes loads within 2 seconds.
- **NFR-6** Support 100 concurrent users while still meeting NFR-1 and NFR-3.
- **NFR-7** Meet NFR-1 with a catalog of up to 20,000 recipes.
- **NFR-8** Keep the database under 400 MB and recipe photos under 800 MB (80% of the free limits).

### Safety

- **NFR-9** Cache recipe drafts in the browser while typing, and restore them after an accidental close or crash.
- **NFR-10** Warn before leaving a page with unsaved changes.
- **NFR-11** Show a notice on every recipe that ingredient and allergen information is not verified by Forkful.

### Security

- **NFR-12** TLS 1.2+ in transit, database encrypted at rest, backup files encrypted before they are stored.
- **NFR-13** Role-based access control: users can read and write only their own saved copies and private recipes.
- **NFR-14** Store passwords only as salted Argon2id or bcrypt hashes; never store or log them in plain text.
- **NFR-15** End sessions after 30 minutes of inactivity.
- **NFR-16** Check scans and dish photos by content, not just extension, in the browser; scans are never uploaded; only compressed WebP photos are stored.
- **NFR-17** Never return private recipes or saved copies from catalog search or any public page; automated tests show 0 leaks.
- **NFR-18** The Catalog Service uses a read-only database role; only import and curation can write the catalog schema.

### Quality attributes

- **NFR-19** Every action gives feedback on whether it worked.
- **NFR-20** OCR reaches at least 90% character accuracy on a test set of printed recipes scanned at 300 DPI.
- **NFR-21** A new user can save a copy of a catalog recipe in 3 clicks or fewer from the search results.
- **NFR-22** Meet WCAG 2.1 Level AA.
- **NFR-23** No horizontal scrolling on screens 320 px wide and larger.
- **NFR-24** Every error message states the problem, its cause, and a suggested action.
- **NFR-25** Available 99% of each month, excluding maintenance announced 24 hours ahead (target only on free plans).
- **NFR-26** Recovery point objective of 24 hours and recovery time objective of 4 hours.
- **NFR-27** Accounts, the Library, and OCR keep working when a recipe import fails or a source site is down.
- **NFR-28** Each architecture component is a separate module behind its own interface, with at least 70% unit-test coverage on service code.
- **NFR-29** The recipe cap and storage warning level can be changed by configuration without redeploying.
- **NFR-30** Support the latest two major versions of Chrome, Safari, and Firefox on desktop and mobile.
- **NFR-31** Scaled and converted amounts are within 1% of the exact value before rounding, checked against at least 50 test conversions.

## Business rules

- **BR-1** Public catalog records can't be changed by users.
- **BR-2** Private recipes are visible only to their owner.
- **BR-3** Recipe import respects source sites' terms of service and robots.txt.
- **BR-4** Users must be at least 13 years old (COPPA).
- **BR-5** Each email address can belong to only one account.
- **BR-6** A saved copy stays in the Library when its catalog original is changed or removed.
- **BR-7** Only System Admins can add, change, or remove catalog recipes.
- **BR-8** Every catalog recipe shows its source site's name and a link to it.
- **BR-9** A user can read or change only the recipes they own.
- **BR-10** Each user can store up to 100 recipes (saved copies plus private recipes).
- **BR-11** Forkful is non-commercial: no ads or payments (Vercel Hobby plan).
- **BR-12** Catalog photos are owned by the team or freely licensed; never copied from source sites.
