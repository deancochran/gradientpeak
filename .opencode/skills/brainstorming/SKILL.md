---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# From Idea to Design: A Collaborative Guide

## Overview

The key is to first understand the project's context, then clarify the idea with targeted questions, and finally, present the design incrementally for validation.

---

### The Design Process

#### 1. Understanding the Idea
*   **Review Project Context:** Begin by examining the current state of the project, including files, documentation, and recent code commits.
*   **Ask Clarifying Questions:** Refine the idea by asking questions one at a time.
    *   Whenever possible, frame questions as multiple-choice, but open-ended questions are also acceptable.
    *   Pose only one question per message. For complex topics, break them down into a series of questions.
*   **Focus on the Core:** Concentrate on understanding the idea's purpose, any constraints, and what defines success.

#### 2. Exploring Solutions
*   **Propose Alternatives:** Suggest two to three different ways to approach the design, each with its own set of trade-offs.
*   **Recommend and Justify:** Present the options in a conversational manner, starting with your recommended solution and explaining the reasoning behind your choice.

#### 3. Presenting the Design
*   **Incremental Presentation:** Once the idea is clear, present the design in manageable sections of 200-300 words.
*   **Validate as You Go:** After each section, pause and ask for feedback to ensure the design is on the right track.
*   **Comprehensive Coverage:** The design should address architecture, components, data flow, error handling, and testing strategies.
*   **Iterate as Needed:** Be prepared to revisit and clarify any part of the design that isn't clear.

---

### After the Design is Complete

#### Documentation
*   Once the design is validated, document it in `docs/plans/YYYY-MM-DD-<topic>/design.md`.


#### Implementation
*   To move forward with implementation, ask, "Ready to set up for implementation?"

---

### Core Principles

*   **One Question at a Time:** Avoid asking multiple questions in a single message.
*   **Prefer Multiple Choice:** Use multiple-choice questions when they can simplify the conversation.
*   **Build Only What is Needed:** Implement features only when they are explicitly required. This avoids over-engineering and creating complex solutions for problems you don't have yet, which helps keep the code simple and reduce waste.
*   **Explore Alternatives:** Always consider at least two to three different solutions.
*   **Validate Incrementally:** Present and confirm the design in small, digestible parts.
*   **Stay Flexible:** Be ready to adapt and clarify as you go.
