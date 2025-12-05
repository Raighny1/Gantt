
import { GoogleGenAI, Type } from "@google/genai";
import { Task, TAILWIND_COLORS, getColorForRole } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateProjectPlan = async (prompt: string): Promise<Task[]> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Create a detailed project schedule for: "${prompt}". 
      Assume the project starts on ${today}.
      Generate 3 to 6 MAIN FEATURES (Tasks).
      For EACH Feature, generate 2 to 4 distinct ROLE ASSIGNMENTS (e.g., Designer, Frontend, Backend, QA).
      
      Rules:
      1. Role assignments within a feature should have logical dependencies (e.g., Design finishes before Frontend starts).
      2. Assignments should have independent start/end dates.
      3. Content MUST be in Traditional Chinese (繁體中文).
      4. Return a JSON array of Features.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Feature name (e.g. Login Page)" },
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { type: Type.STRING, description: "Role name (e.g. UI Designer)" },
                    subTask: { type: Type.STRING, description: "Specific task detail (e.g. Wireframe, API Coding)" },
                    startDayOffset: { type: Type.INTEGER, description: "Days from project start" },
                    durationDays: { type: Type.INTEGER, description: "Duration in days" },
                    progress: { type: Type.INTEGER, description: "0-100" }
                  },
                  required: ["role", "startDayOffset", "durationDays"]
                }
              }
            },
            required: ["name", "assignments"],
          },
        },
      },
    });

    const rawData = JSON.parse(response.text || "[]");

    // Transform AI response to App Task Model
    const newTasks: Task[] = rawData.map((item: any) => {
      const assignments = (item.assignments || []).map((assign: any) => {
        const start = new Date();
        start.setDate(start.getDate() + (assign.startDayOffset || 0));
        
        const end = new Date(start);
        end.setDate(end.getDate() + (Math.max(1, assign.durationDays) - 1));

        const role = assign.role || "Team";

        return {
          id: crypto.randomUUID(),
          role: role,
          subLabel: assign.subTask || "",
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          progress: assign.progress || 0,
          color: getColorForRole(role)
        };
      });

      return {
        id: crypto.randomUUID(),
        name: item.name,
        assignments: assignments
      };
    });

    return newTasks;

  } catch (error) {
    console.error("Failed to generate plan:", error);
    throw error;
  }
};

interface FileInput {
  inlineData: {
    data: string;
    mimeType: string;
  }
}

export const parseImportData = async (input: string | FileInput): Promise<Task[]> => {
  try {
    let contents: any = '';

    const systemPrompt = `Analyze the provided project schedule data (either text or PDF document).
      Extract the "Functions/Features" and their "Role Assignments".
      
      CRITICAL REQUIREMENT: Separate the "Role" from the "Task Detail".
      Example Input: "[UI] 畫面設計"
      Output -> Role: "UI", SubTask: "畫面設計"

      Example Input: "FE API 串接"
      Output -> Role: "FE", SubTask: "API 串接"

      Goal: Structure the data into a hierarchical JSON format.

      Structure:
      - "Function Phase X..." or "Main Feature Title"
      - Underneath are lines like "[UI] Design...", "FE Coding...", "UX Review..."
      - Dates are often in MM/DD/YY format (e.g., 11/19/25 means 2025-11-19).

      Tasks:
      1. Identify Feature Names.
      2. Identify Role (Keep it short, e.g., UI, FE, BE, PM).
      3. Identify SubTask (The description of work).
      4. Extract Start and End dates (YYYY-MM-DD).
      5. Return a JSON array matching the schema.
    `;

    if (typeof input === 'string') {
      // Text Input
      contents = {
        parts: [
          { text: `Input Text Data:\n"""\n${input.slice(0, 25000)}\n"""` }
        ]
      };
    } else {
      // PDF File Input
      contents = {
        parts: [
          input // { inlineData: { mimeType: 'application/pdf', data: 'base64...' } }
        ]
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "The Feature Name" },
              assignments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { type: Type.STRING, description: "Short Role Code (e.g. UI, FE)" },
                    subTask: { type: Type.STRING, description: "Task Description" },
                    startDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                    endDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                  },
                  required: ["role", "startDate", "endDate"]
                }
              }
            },
            required: ["name", "assignments"],
          },
        },
      },
    });

    const rawData = JSON.parse(response.text || "[]");

    // Transform to App Model
    const newTasks: Task[] = rawData.map((item: any) => {
      const assignments = (item.assignments || []).map((assign: any) => {
        const role = assign.role || "未指派";
        return {
          id: crypto.randomUUID(),
          role: role,
          subLabel: assign.subTask || "",
          startDate: assign.startDate,
          endDate: assign.endDate,
          progress: 0,
          color: getColorForRole(role)
        };
      });

      return {
        id: crypto.randomUUID(),
        name: item.name || "未命名功能",
        assignments: assignments
      };
    });

    return newTasks;

  } catch (error) {
    console.error("AI Parse failed:", error);
    throw error;
  }
};
