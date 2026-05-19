# Repair540 Analytics Reporting Guide

## GA4 Property

- Measurement ID: `G-VB6TQCK198`

## Tracked Page Scope

- `index.html`
- `menu.html`
- `blog.html`
- `post.html`
- `faq.html`
- `access.html`
- `contact.html`

## Custom Events Added

- `menu_open`
- `navigation_click`
- `contact_click`
- `social_click`
- `location_click`
- `faq_open`
- `pricing_category_select`
- `blog_post_open`
- `blog_post_view`
- `generate_lead`

## Event Parameters

- `page_path`
- `page_title`
- `link_text`
- `link_url`
- `navigation_area`
- `contact_method`
- `social_platform`
- `destination`
- `faq_question`
- `category_name`
- `post_id`
- `post_title`
- `post_category`
- `form_name`
- `lead_type`

## Recommended GA4 Custom Dimensions

Create event-scoped custom dimensions in GA4 for the following parameters if you want to use them directly in standard reports and Looker Studio:

1. `contact_method`
2. `social_platform`
3. `destination`
4. `navigation_area`
5. `faq_question`
6. `category_name`
7. `post_title`
8. `post_category`
9. `lead_type`

## Recommended Looker Studio Report Structure

### 1. Weekly Summary

- Date range: last 7 days
- Metrics:
  - Users
  - Views
  - Sessions
  - Average engagement time

### 2. Popular Pages TOP 5

- Dimension:
  - Page path + query string
  - or Page title
- Metric:
  - Views

### 3. Traffic Sources

- Dimensions:
  - Session source / medium
  - Session default channel group
- Recommended checks:
  - Google organic
  - Instagram
  - Google Maps
  - Direct

### 4. Device Mix

- Dimension:
  - Device category
- Metric:
  - Users
  - Views

### 5. Trend Chart

- Dimension:
  - Date
- Metrics:
  - Views
  - Users

### 6. Contact Actions

- Dimension:
  - Event name
  - contact_method
- Metrics:
  - Event count

### 7. Blog / FAQ Interest

- Blog:
  - Dimension: `post_title`
  - Metric: Event count for `blog_post_view`
- FAQ:
  - Dimension: `faq_question`
  - Metric: Event count for `faq_open`

## Recommended Weekly Operation

- Timing: every Monday between 08:00 and 09:00 JST
- Delivery: Looker Studio scheduled email with PDF attachment
- Suggested recipients:
  - Store owner
  - Internal operations email

## Looker Studio Setup Steps

1. Connect GA4 property `G-VB6TQCK198`
2. Build the sections listed above
3. Set report date range default to `Last 7 days`
4. Turn on scheduled delivery
5. Set weekly send time to Monday morning
6. Enable PDF attachment

## Notes

- `post.html` updates title and description dynamically per article, so blog detail pages are easier to distinguish in analytics exports.
- Traffic from Instagram or Google Maps depends on the actual referrer passed by each platform/browser. The code now tracks direct clicks on those outbound links where applicable, and GA4 will also capture inbound traffic source data when available.
