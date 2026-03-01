# VoxTriage: Real-Time AI Paramedic Copilot

## Problem Statement

### The Challenge

Emergency medical services (EMS) operate in high-stress, time-critical environments where paramedics must rapidly assess, triage, and treat patients with incomplete information, limited resources, and frequent distractions. The complexity of modern medicine, combined with the unpredictability of field scenarios, leads to several persistent challenges:

- **Cognitive Overload:** Paramedics must synthesize patient history, vital signs, symptoms, and scene context in real time, often while multitasking and under pressure.
- **Incomplete Data:** Initial patient information is frequently fragmented, with missing details about allergies, medications, or medical history.
- **Dynamic Scenarios:** Patient conditions can deteriorate or evolve rapidly, requiring continuous reassessment and adaptation of care.
- **Protocol Complexity:** EMS protocols are extensive and nuanced, making it difficult to recall the best course of action for rare or complex cases.
- **Communication Barriers:** Language differences, noisy environments, and stress can impede clear communication between paramedics, patients, and receiving hospitals.
- **Documentation Burden:** Accurate record-keeping is essential for legal, clinical, and quality assurance purposes, but is often deprioritized in the heat of an emergency.

### Why AI Copilot?

Despite advances in medical technology, most EMS teams still rely on manual note-taking, memory, and static checklists. There is a critical need for an intelligent, real-time assistant that can:

- **Proactively surface clinical alerts and red flags** as new information is received.
- **Ask targeted follow-up questions** to fill gaps in the assessment.
- **Suggest evidence-based treatments and interventions** tailored to the evolving scenario.
- **Analyze images and documents** (e.g., medication lists, wound photos) for additional context.
- **Streamline documentation and handoff** to receiving facilities.

### The Solution: VoxTriage

VoxTriage addresses these challenges by integrating Mistral AI models into a seamless, real-time copilot for paramedics. The system:

- Listens to live audio or text input, transcribes and extracts clinical data.
- Continuously analyzes the triage state, generating actionable insights after every update.
- Surfaces critical alerts, follow-up questions, and treatment suggestions in real time.
- Supports multi-modal input (voice, text, images, documents) and multi-segment scenarios.
- Maintains a full audit log and structured notes for compliance and review.
- Enables paramedics to focus on patient care, while the copilot handles cognitive load, protocol recall, and documentation.

VoxTriage transforms emergency medicine by making advanced clinical reasoning, proactive guidance, and robust documentation available at the point of care, anywhere in the world.

## Overview

VoxTriage is an advanced real-time paramedic triage copilot built for the Mistral Worldwide Hackathon. It leverages Mistral AI models for clinical reasoning, voice transcription, and vision/document analysis, providing paramedics with proactive alerts, follow-up questions, and treatment suggestions during emergency scenarios. The system is designed for field reliability, speed, and clinical depth, supporting multi-modal input and real-time feedback.

## Demo Video

Watch a full walkthrough of VoxTriage in action:

[YouTube Demo](https://www.youtube.com/watch?v=7MAIBw-sBAs)

---

## Features

- **AI Copilot That Talks Back:** After each triage update, the copilot generates clinical alerts, follow-up questions, and actionable suggestions, delivered in real time.
- **Voice-to-Text Triage:** Live audio transcription using Voxtral SDK, supporting hands-free operation.
- **Treatment Suggestions:** AI-generated treatment plans based on extracted triage data.
- **Vision & Document AI:** Analyze images (e.g., wounds, accident scenes) and documents (e.g., medication lists) for clinical context.
- **Session Notes & Audit Log:** Structured notes and full audit trail for every session.
- **Vitals Alerts:** Automatic detection and alerting for abnormal vital signs.
- **Theme Toggle:** Dark/light mode for field usability.
- **Multi-Segment Input:** Supports progressive triage updates, accumulating insights as the scenario evolves.
- **MySQL Database:** All patient records, notes, and audit logs are stored in a MySQL database for reliability and compliance.
- **Toast Notifications & Status Indicators:** Real-time feedback for all major actions and AI panel states.
- **View Persistence:** Dashboard and session views remain mounted for seamless navigation.

---

## Architecture

- **Backend:** FastAPI (Python 3.12), fully async, MySQL-only database, Mistral SDK integration.
- **Frontend:** React 19, TypeScript 5.6+, Vite 6, Lucide React icons, pure CSS (no frameworks).
- **WebSocket:** Real-time bidirectional communication for session state, transcript, triage, copilot insights, and lifecycle events.

---

## Mistral AI Models Used

- **voxtral-mini-2507:** Real-time voice transcription (Voxtral SDK)
- **mistral-large-latest:** Clinical triage extraction, treatment suggestions, copilot insights
- **mistral-small-latest:** Vision and document analysis

---

## Data Model

- **TriageRecord:** Extracted clinical state (priority, chief complaint, patient info, vitals, symptoms, interventions, mechanism, etc.)
- **CopilotInsight:** Alerts (critical/warning/info), follow-up questions, suggestions, clinical reasoning
- **TreatmentResult:** AI-generated treatment plan
- **ImageAnalysisResult / DocumentParseResult:** Vision/document AI outputs
- **SessionNote:** Structured notes per session
- **AuditEntry:** Full audit log of actions/events

---

## Database

- **Engine:** MySQL (required, no fallback)
- **Tables:** patients, session_notes, audit_log
- **Connection:**
  - host: `localhost`
  - port: `3306`
  - user: `root`
  - password: `admin`
  - database: `voxtriage`

---

## Setup & Installation

### Prerequisites
- Python 3.12+
- Node.js 20+
- MySQL 8+

### Backend
1. Install dependencies:
   ```bash
   cd server
   pip install -r requirements.txt
   ```
2. Set up MySQL and create the `voxtriage` database.
3. Copy `.env.example` to `.env` and update credentials if needed.
4. Run the FastAPI server:
   ```bash
   python run.py
   ```

### Frontend
1. Install dependencies:
   ```bash
   cd client
   npm install
   ```
2. Build and start the client:
   ```bash
   npm run dev
   ```
   or for production:
   ```bash
   npm run build
   npm run preview
   ```

---

## Usage

1. **Start the backend and frontend servers.**
2. **Login/Register** as a paramedic user.
3. **Start a triage session** from the dashboard.
4. **Send audio or text segments** describing the patient scenario. Each segment triggers triage extraction and copilot insight generation.
5. **Switch to the Copilot tab** to view real-time alerts, questions, and suggestions. Badge counter increments with each new insight.
6. **Review treatment suggestions, vision/document analysis, and session notes** as needed.
7. **End the session** to save all data to the database and generate a full audit log.

---

## Example Scenarios

### Trauma (multi-segment)
1. "Dispatched to a rollover motor vehicle accident on rural highway. 29 year old male, unrestrained driver, ejected from vehicle. Found 10 meters from car, lying supine."
2. "Patient is conscious but confused. GCS 13. Heart rate 124, blood pressure 90 over 58, respiratory rate 28, SpO2 92 percent. Large scalp laceration with active bleeding."
3. "Pupils unequal, right 5mm sluggish, left 3mm reactive. Abdomen distended, tender in left upper quadrant. Open fracture right femur, bone exposed. Complains of severe pain."
4. "Applied cervical collar, started two large bore IVs, normal saline wide open. Pressure dressing to scalp, splinted femur. Patient becoming more agitated, GCS now 10."

### Pediatric Asthma
1. "7 year old female, history of asthma. Difficulty breathing started 1 hour ago, not improved with inhaler. No known allergies."
2. "Child sitting upright, tripod position, intercostal retractions. Respiratory rate 40, heart rate 148, SpO2 89 percent. Bilateral wheezing, speaking in single words."
3. "Administered albuterol nebulizer, started oxygen via non-rebreather. After 10 minutes, SpO2 improved to 92, respiratory rate 36. Child appears tired, less responsive."

---

## Security

- All code and dependencies are scanned with Snyk for vulnerabilities.
- No patient data is stored outside the secure MySQL database.
- JWT authentication for all user actions.

---

## Hackathon Details

- **Event:** Mistral Worldwide Hackathon
- **Team:** VoxTriage
- **Category:** Emergency Medicine / AI Copilot
- **Tech Stack:** FastAPI, React, MySQL, Mistral AI SDK
- **Models:** voxtral-mini-2507, mistral-large-latest, mistral-small-latest

---

## License

This project is released under the MIT License.

---

## Contact

For questions or demo requests, contact the team at saqlain2204@gmail.com or via GitHub Issues.
