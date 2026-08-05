/* global describe, it, expect, beforeEach, jest */
import { unprotect } from "mobx-state-tree";
import { LLMTextAreaModel } from "../LLMTextArea";

// Mock dependencies
jest.mock("../../../../components/Infomodal/Infomodal", () => ({
  __esModule: true,
  default: {
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../../../core/Registry", () => ({
  __esModule: true,
  default: {
    addTag: jest.fn(),
  },
}));

describe("LLMTextArea Model", () => {
  let model;

  beforeEach(() => {
    model = LLMTextAreaModel.create({
      name: "test_llm",
      toname: "text",
      prompttemplate: "Summarize: {{input}}",
      numresponses: "1",
      maxsubmissions: "1",
      editable: true,
      rows: "3",
      label: "Test Input",
    });

    // Unprotect for testing to allow direct property assignment
    unprotect(model);

    // Mock methods that depend on annotation
    model.updateResult = jest.fn();
    model.isReadOnly = () => false;

    global.window.ForteRuntime = {
      baseUrl: "http://backend.test",
      token: "test-token",
      assignmentId: "42",
    };
  });

  afterEach(() => {
    delete global.window.ForteRuntime;
  });

  describe("Initial State", () => {
    it("should have correct initial values", () => {
      expect(model.type).toBe("llmtextarea");
      expect(model._currentInput).toBe("");
      expect(model.submission).toBe(null);
      expect(model._isEditing).toBe(false);
      expect(model.holdsState).toBe(false);
      expect(model.hasSubmitted).toBe(false);
    });

    it("should parse numResponses correctly", () => {
      expect(model.numResponsesInt).toBe(1);

      model.numresponses = "3";
      expect(model.numResponsesInt).toBe(3);

      model.numresponses = "10"; // Should be clamped to 5
      expect(model.numResponsesInt).toBe(5);

      model.numresponses = "-1"; // Should be clamped to 1
      expect(model.numResponsesInt).toBe(1);
    });
  });

  describe("Prompt Building", () => {
    it("should replace {{input}} placeholder", () => {
      const prompt = model.buildPrompt("User question here");
      expect(prompt).toBe("Summarize: User question here");
    });

    it("should handle missing placeholders gracefully", () => {
      model.prompttemplate = "Value: {{missing}}";
      const prompt = model.buildPrompt("test");
      expect(prompt).toBe("Value: {{missing}}");
    });

    it("should handle template without placeholders", () => {
      model.prompttemplate = "Simple prompt";
      const prompt = model.buildPrompt("test");
      expect(prompt).toBe("Simple prompt");
    });
  });

  describe("Value Management", () => {
    it("should set current input value", () => {
      model.setValue("New input");
      expect(model._currentInput).toBe("New input");
    });

    it("should cancel editing", () => {
      model._isEditing = true;
      model._currentInput = "Some input";

      model.cancelEditing();
      expect(model._isEditing).toBe(false);
      expect(model._currentInput).toBe("");
    });

    it("should delete submission", () => {
      model.submission = {
        id: "sub-1",
        userInput: "Test",
        prompt: "Test",
        responses: [],
        status: "success",
        error: null,
        timestamp: Date.now(),
      };

      model.deleteSubmission();
      expect(model.submission).toBe(null);
      expect(model._currentInput).toBe("");
      expect(model._isEditing).toBe(false);
      expect(model.updateResult).toHaveBeenCalled();
    });
  });

  describe("Result Serialization", () => {
    it("should return null when no submission", () => {
      expect(model.selectedValues()).toBe(null);
      expect(model.serializableValue).toBe(null);
    });

    it("should serialize submission correctly", () => {
      model.submission = {
        id: "sub-1",
        userInput: "User input",
        prompt: "Final prompt",
        responses: [
          {
            text: "LLM response",
            metadata: { model: "gpt-4", tokens: 100 },
          },
        ],
        status: "success",
        error: null,
        timestamp: 1234567890,
      };

      const result = model.selectedValues();
      expect(result).toEqual({
        user_input: "User input",
        prompt: "Final prompt",
        responses: [
          {
            text: "LLM response",
            metadata: { model: "gpt-4", tokens: 100 },
          },
        ],
        timestamp: 1234567890,
      });
    });
  });

  describe("Update from Result", () => {
    it("should restore from saved annotation", () => {
      const savedValue = {
        user_input: "Saved input",
        prompt: "Saved prompt",
        responses: [
          {
            text: "Saved response",
            metadata: { model: "gpt-4" },
          },
        ],
        timestamp: 9876543210,
      };

      model.updateFromResult(savedValue);

      expect(model.submission).not.toBe(null);
      expect(model.submission.userInput).toBe("Saved input");
      expect(model.submission.prompt).toBe("Saved prompt");
      expect(model.submission.responses.length).toBe(1);
      expect(model.submission.responses[0].text).toBe("Saved response");
      expect(model.submission.status).toBe("success");
    });

    it("should clear submission when value is null", () => {
      model.submission = {
        id: "sub-1",
        userInput: "Test",
        prompt: "Test",
        responses: [],
        status: "success",
        error: null,
        timestamp: Date.now(),
      };

      model.updateFromResult(null);
      expect(model.submission).toBe(null);
      expect(model._currentInput).toBe("");
    });
  });

  describe("State Queries", () => {
    it("should report loading state correctly", () => {
      expect(model.isLoading).toBe(false);

      model.submission = {
        id: "sub-1",
        userInput: "Test",
        prompt: "Test",
        responses: [],
        status: "loading",
        error: null,
        timestamp: Date.now(),
      };

      expect(model.isLoading).toBe(true);
    });

    it("should report holdsState when submission exists", () => {
      expect(model.holdsState).toBe(false);

      model.submission = {
        id: "sub-1",
        userInput: "Test",
        prompt: "Test",
        responses: [],
        status: "success",
        error: null,
        timestamp: Date.now(),
      };

      expect(model.holdsState).toBe(true);
    });

    it("should check if can submit", () => {
      expect(model.canSubmit).toBe(true);

      // Simulate a completed generation by setting both submission + generationCount.
      model.submission = {
        id: "sub-1",
        userInput: "Test",
        prompt: "Test",
        responses: [],
        status: "success",
        error: null,
        timestamp: Date.now(),
      };
      model._generationCount = 1;

      // Cannot submit again with maxSubmissions=1
      expect(model.canSubmit).toBe(false);

      // Can submit with maxSubmissions > 1 (count < max)
      model.maxsubmissions = "2";
      expect(model.canSubmit).toBe(true);

      // Cannot submit if not editable even with max > 1
      model.editable = false;
      expect(model.canSubmit).toBe(false);
    });
  });

  describe("API Integration", () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should call API with correct payload", async () => {
      model._currentInput = "Test input";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responses: [
            {
              text: "Generated response",
              metadata: { model: "gpt-4", tokens: 50 },
            },
          ],
        }),
      });

      await model.generateResponse();

      expect(global.fetch).toHaveBeenCalledWith(
        "http://backend.test/api/v1/active-assignments/42/llm/generate/",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Token test-token",
          },
          body: expect.any(String),
        }),
      );

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.prompt).toBe("Summarize: Test input");
      expect(callBody.num_responses).toBe(1);

      expect(model.submission.status).toBe("success");
      expect(model.submission.responses.length).toBe(1);
      expect(model.submission.responses[0].text).toBe("Generated response");
    });

    it("should handle API errors", async () => {
      model._currentInput = "Test input";

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "Server error" }),
      });

      await model.generateResponse();

      expect(model.submission.status).toBe("error");
      expect(model.submission.error).toContain("Server error");
    });

    it("should handle network errors", async () => {
      model._currentInput = "Test input";

      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      await model.generateResponse();

      expect(model.submission.status).toBe("error");
      expect(model.submission.error).toBe("Network error");
    });

    it("errors out without window.ForteRuntime and does not call fetch", async () => {
      delete global.window.ForteRuntime;
      model._currentInput = "Test input";

      await model.generateResponse();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(model.submission.status).toBe("error");
      expect(model.submission.error).toMatch(/ForteRuntime/);
    });

    it("should handle single response format", async () => {
      model._currentInput = "Test input";

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: "Single response text",
          model: "gpt-3.5",
          tokens: 25,
        }),
      });

      await model.generateResponse();

      expect(model.submission.status).toBe("success");
      expect(model.submission.responses.length).toBe(1);
      expect(model.submission.responses[0].text).toBe("Single response text");
      expect(model.submission.responses[0].metadata.model).toBe("gpt-3.5");
    });
  });

  describe("buildPrompt $ escape (no special JS replacement patterns)", () => {
    it("treats $& in userInput as a literal string, not a backreference", () => {
      model.prompttemplate = "Prompt: {{input}}";
      const prompt = model.buildPrompt("price is $& total");
      expect(prompt).toBe("Prompt: price is $& total");
    });

    it("treats $$ in userInput as literal $$", () => {
      model.prompttemplate = "Input: {{input}}";
      const prompt = model.buildPrompt("cost $$5");
      expect(prompt).toBe("Input: cost $$5");
    });

    it("handles backtick replacement pattern $` without expansion", () => {
      model.prompttemplate = "{{input}}";
      const prompt = model.buildPrompt("before $` after");
      expect(prompt).toBe("before $` after");
    });
  });

  describe("canSubmit with generationCount", () => {
    it("starts as true (no generations yet)", () => {
      expect(model.canSubmit).toBe(true);
    });

    it("is false after maxSubmissions generations with editable=true and max=1", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ responses: [{ text: "r", metadata: {} }] }),
      });
      model._currentInput = "test";
      await model.generateResponse();
      expect(model._generationCount).toBe(1);
      // maxsubmissions="1", editable=true → still false once we've hit the cap
      expect(model.canSubmit).toBe(false);
    });

    it("allows re-generate when maxSubmissions > 1", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ responses: [{ text: "r", metadata: {} }] }),
      });
      model.maxsubmissions = "2";
      model._currentInput = "test";
      await model.generateResponse();
      expect(model.canSubmit).toBe(true);
      await model.generateResponse();
      expect(model._generationCount).toBe(2);
      expect(model.canSubmit).toBe(false);
    });

    it("resets generationCount on deleteSubmission", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ responses: [{ text: "r", metadata: {} }] }),
      });
      model._currentInput = "test";
      await model.generateResponse();
      expect(model._generationCount).toBe(1);
      model.deleteSubmission();
      expect(model._generationCount).toBe(0);
      expect(model.canSubmit).toBe(true);
    });
  });

  describe("AbortController — delete during generate", () => {
    it("aborts in-flight fetch when deleteSubmission is called during generate", async () => {
      let resolveFetch;
      global.fetch = jest.fn().mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );

      model._currentInput = "test";
      const genPromise = model.generateResponse();

      // Let MST/flow tick so submission is created and fetch is in flight
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(model.submission?.status).toBe("loading");

      // Abort via deleteSubmission
      model.deleteSubmission();
      expect(model.submission).toBe(null);

      // Resolve the fetch after abort — should not throw or update submission
      resolveFetch({ ok: true, json: async () => ({ responses: [] }) });
      await genPromise;

      // Model should stay clean — no orphan submission
      expect(model.submission).toBe(null);
    });
  });
});
