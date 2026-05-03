# Faculty Appraisal System - API V1 Reference

This document provides a comprehensive guide to all endpoints in the Faculty Appraisal System.

## 1. Core Principles
- **Base URL**: `https://fastapi-backend-376777978967.us-central1.run.app/api/v1`
- **Auth**: Supabase JWT Bearer Token in `Authorization` header.
- **Data Types**: All IDs (`id`, `faculty_id`) are UUID strings.
- **File Uploads**: Use `multipart/form-data` for endpoints accepting a `file`.

---

## 2. Standard Appraisal Categories
Every category (e.g., `/part-a/teaching-process`, `/part-b/journal-publications`) follows a standard **6-endpoint pattern**.

### The 6 Standard Endpoints
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/` | **Create**: Adds a new entry. Accepts form fields + optional PDF `file`. |
| `GET` | `/` | **List All**: Returns all entries in the category (Admin/Higher Roles only). |
| `GET` | `/faculty/{faculty_id}` | **List Faculty**: Returns all entries for a specific faculty member. |
| `PUT` | `/{id}` | **Update**: Modifies an entry. Field permissions depend on user role. |
| `DELETE` | `/{id}` | **Delete**: Removes an entry. |
| `GET` | `/summary/{faculty_id}` | **Score**: Returns the calculated score for this category (e.g., `{ "totalScore": 25.0 }`). |

---

## 3. Part A: Teaching & Activities

### 3.1. Teaching Process (`/part-a/teaching-process`)
- **Fields**: `semester`, `course_code_name`, `planned_classes`, `conducted_classes`, `department`, `file`.
- **Logic**: Auto-calculates `api_score_faculty` based on (conducted/planned) ratio.

### 3.2. Course File (`/part-a/course-files`)
- **Fields**: `course_paper`, `title`, `details_proof` (boolean), `department`, `file`.

### 3.3. Innovative Teaching (`/part-a/teaching-methods`)
- **Fields**: `short_description`, `details_proof` (boolean), `department`, `file`.

### 3.4. Student Feedback (`/part-a/student-feedback`)
- **Fields**: `course_code_name`, `first_feedback` (0-5), `second_feedback` (0-5).
- **Response**: Returns `average` (server-calculated).

### 3.5. Other Categories
The standard 6-endpoint pattern applies to:
- `/part-a/projects`
- `/part-a/qualification-enhancement`
- `/part-a/department-activities`
- `/part-a/university-activities`
- `/part-a/social-contributions`
- `/part-a/industry-connect`
- `/part-a/acr` (Annual Confidential Report)

---

## 4. Part B: Research & Academic Contributions

### 4.1. Journal Publications (`/part-b/journal-publications`)
- **Fields**: `title_with_page_nos`, `journal_details`, `issn_isbn_no`, `indexing` (Enum: SCOPUS, SCI, SCIE, UGC), `department`, `file`.

### 4.2. Research Projects (`/part-b/research-projects`)
- **Fields**: `project_name`, `funding_agency`, `date_of_sanction` (YYYY-MM-DD), `funding_amount`, `role`, `project_status`, `file`.

### 4.3. Research Guidance (`/part-b/research-guidance`)
- **Fields**: `degree` (ME/PHD), `student_name`, `submission_status`, `award_date` (YYYY-MM-DD).

### 4.4. Other Categories
The standard 6-endpoint pattern applies to:
- `/part-b/book-publications`
- `/part-b/pedagogy`
- `/part-b/ipr`
- `/part-b/research-awards`
- `/part-b/conferences`
- `/part-b/research-proposals`
- `/part-b/products`
- `/part-b/self-development`
- `/part-b/industrial-training`

---

## 5. Overall Appraisal Summary
- **Endpoint**: `GET /api/v1/appraisal-summary/{faculty_id}`
- **Response**: Aggregates all scores from Part A (out of 200) and Part B (out of 375).

```json
{
  "faculty_id": "uuid",
  "part_a_summary": { "teaching_score": 25, "feedback_score": 10, ... },
  "part_b_summary": { "journal_score": 30, "project_score": 10, ... },
  "grand_total_score": 575.0
}
```

---

## 6. Remarks & Approval Flow
Authorities (HOD, Director, Dean, VC) use these to finalize the appraisal.

- **HOD**: `PUT /api/v1/appraisal-remarks/hod/{faculty_id}`
- **Director**: `PUT /api/v1/appraisal-remarks/director/{faculty_id}`
- **Dean**: `PUT /api/v1/appraisal-remarks/dean/{faculty_id}`
- **Final (VC)**: `PUT /api/v1/appraisal-remarks/final/{faculty_id}`

---

## 7. Finalization (Faculty)
- **Enclosures**: `POST /api/v1/enclosures` (Multipart: `description`, `file`)
- **Declaration**: `POST /api/v1/declaration` (JSON: `is_declared`, `place`, `designation`)

---

## 8. Status Codes
- `201 Created`: Successfully added.
- `200 OK`: Successful retrieval/update.
- `204 No Content`: Successful deletion.
- `401 Unauthorized`: Token missing or invalid.
- `403 Forbidden`: Insufficient role permissions.
- `404 Not Found`: Item or Faculty does not exist.
- `422 Unprocessable Entity`: Validation error (check request body).
