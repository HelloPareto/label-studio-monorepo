import { useEffect } from "react";
import { observer } from "mobx-react";
import { types, flow, isAlive } from "mobx-state-tree";
import { Button, Input, Spin, Alert, Card, Typography, Space } from "antd";
import { ReloadOutlined, EditOutlined, DeleteOutlined, CheckOutlined } from "@ant-design/icons";

import InfoModal from "../../../components/Infomodal/Infomodal";
import Registry from "../../../core/Registry";
import { guidGenerator } from "../../../core/Helpers";
import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import RequiredMixin from "../../../mixins/Required";
import PerRegionMixin from "../../../mixins/PerRegion";
import { ReadOnlyControlMixin } from "../../../mixins/ReadOnlyMixin";
import ControlBase from "../Base";
import ClassificationBase from "../ClassificationBase";
import { parseValue } from "../../../utils/data";
import { getForteRuntime, forteAuthHeaders } from "../../../utils/forteRuntime";

import "./LLMTextArea.scss";

const { TextArea } = Input;
const { Text } = Typography;

function generateEndpoint(cfg) {
  return `${cfg.baseUrl}/api/v1/active-assignments/${cfg.assignmentId}/llm/generate/`;
}

/**
 * The `LLMTextArea` tag displays a text area that generates LLM responses on submit.
 * Use for tasks requiring LLM-assisted annotation, response generation, or interactive prompting.
 *
 * Use with the following data types: text, image, audio, video, HTML.
 *
 * Endpoint and auth come from `window.ForteRuntime` at runtime, never XML attributes
 * (see `utils/forteRuntime.js`).
 *
 * @example
 * <!--Basic configuration for LLM response generation -->
 * <View>
 *   <Text name="text" value="$text"/>
 *   <LLMTextArea
 *     name="llm_gen"
 *     toName="text"
 *     promptTemplate="Summarize: {{input}}"
 *   />
 * </View>
 *
 * @example
 * <!--Generate multiple responses for ranking -->
 * <View>
 *   <LLMTextArea
 *     name="llm_responses"
 *     promptTemplate="$config.prompt"
 *     numResponses="3"
 *   />
 *   <Choices name="best" toName="llm_responses" choice="single">
 *     <Choice value="Response 1"/>
 *     <Choice value="Response 2"/>
 *     <Choice value="Response 3"/>
 *   </Choices>
 * </View>
 *
 * @name LLMTextArea
 * @meta_title LLMTextArea Tag for LLM Response Generation
 * @meta_description LLMTextArea tag for generating and annotating LLM responses in Label Studio for machine learning and data science projects.
 * @param {string} name                     - Name of the element
 * @param {string} toName                   - Name of the element to connect to
 * @param {string} promptTemplate           - Prompt template with {{input}} placeholder or $task.field
 * @param {number} [numResponses=1]         - Number of LLM responses to generate (1-5)
 * @param {number} [maxSubmissions=1]       - Maximum submissions allowed
 * @param {boolean} [editable=true]         - Allow editing input after submission
 * @param {number} [rows=3]                 - Number of rows in textarea
 * @param {string} [placeholder]            - Placeholder text
 * @param {string} [label="Your Input"]     - Label for input field
 * @param {boolean} [required=false]        - Whether input is required
 * @param {string} [requiredMessage]        - Validation message
 */

const TagAttrs = types.model({
  toname: types.maybeNull(types.string),
  prompttemplate: types.string,
  numresponses: types.optional(types.string, "1"),
  maxsubmissions: types.optional(types.string, "1"),
  editable: types.optional(types.boolean, true),
  rows: types.optional(types.string, "3"),
  placeholder: types.maybeNull(types.string),
  label: types.optional(types.string, "Your Input"),
});

// Single submission that holds user input + LLM responses
const LLMSubmission = types
  .model("LLMSubmission", {
    id: types.identifier,
    userInput: types.string,
    prompt: types.string, // Processed prompt sent to backend
    responses: types.array(
      types.model("LLMResponse", {
        text: types.string,
        metadata: types.frozen(), // model, tokens, etc
      }),
    ),
    status: types.enumeration("LLMStatus", ["idle", "loading", "success", "error"]),
    error: types.maybeNull(types.string),
    timestamp: types.number,
  })
  .actions((self) => ({
    setLoading() {
      self.status = "loading";
      self.error = null;
    },

    setSuccess() {
      self.status = "success";
      self.error = null;
    },

    setError(errorMessage) {
      self.status = "error";
      self.error = errorMessage;
    },

    updateInput(userInput, prompt) {
      self.userInput = userInput;
      self.prompt = prompt;
      self.timestamp = Date.now();
    },

    clearResponses() {
      self.responses.clear();
    },

    addResponse(text, metadata) {
      self.responses.push({ text, metadata });
    },
  }));

const Model = types
  .model({
    type: "llmtextarea",
    pid: types.optional(types.string, guidGenerator),

    // Current input being edited
    _currentInput: types.optional(types.string, ""),

    // Single submission (null if not submitted yet)
    submission: types.maybeNull(LLMSubmission),

    // Edit mode
    _isEditing: types.optional(types.boolean, false),

    // Tracks how many times the user has successfully generated so
    // canSubmit can enforce maxSubmissions correctly.
    _generationCount: types.optional(types.number, 0),
  })
  .volatile(() => ({
    // AbortController for the in-flight generate fetch; allows
    // deleteSubmission and unmount to cancel the request.
    _generateController: null,
  }))
  .views((self) => ({
    get holdsState() {
      return self.submission !== null;
    },

    get hasSubmitted() {
      return self.submission !== null;
    },

    get canSubmit() {
      const max = Number.parseInt(self.maxsubmissions) || 1;
      // Allow if never generated, or if editable and under the cap.
      return self._generationCount === 0 || (self.editable && self._generationCount < max);
    },

    get isLoading() {
      return self.submission?.status === "loading";
    },

    get numResponsesInt() {
      return Math.min(Math.max(Number.parseInt(self.numresponses) || 1, 1), 5);
    },

    selectedValues() {
      if (!self.submission) return null;

      return {
        user_input: self.submission.userInput,
        prompt: self.submission.prompt,
        responses: self.submission.responses.map((r) => ({
          text: r.text,
          metadata: r.metadata,
        })),
        timestamp: self.submission.timestamp,
      };
    },

    get serializableValue() {
      return self.selectedValues();
    },

    // Build final prompt from template
    buildPrompt(userInput) {
      let template = self.prompttemplate;

      // If it's a $task.field reference, resolve it
      if (template.startsWith("$")) {
        template = parseValue(template, self.annotation?.store?.task?.dataObj ?? {});
      }

      // If template is still not a string (e.g., undefined), use empty string
      if (typeof template !== "string") {
        template = "";
      }

      // Use replacer functions so JS special replacement patterns in the user's
      // text ($& $$ $` $' $<n>) are treated as literal strings, not references.
      let prompt = template.replace(/\{\{input\}\}/g, () => userInput);

      // Replace {{fieldName}} with task data fields.
      const taskData = self.annotation?.store?.task?.dataObj ?? {};
      prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return key in taskData ? String(taskData[key]) : match;
      });

      return prompt;
    },
  }))
  .actions((self) => {
    // Capture validate from the mixin chain (RequiredMixin) before overriding.
    const Super = { validate: self.validate };

    return {
      setValue(value) {
        self._currentInput = value;
      },

      startEditing() {
        if (self.submission && self.editable && !self.isReadOnly() && self.canSubmit) {
          self._isEditing = true;
          self._currentInput = self.submission.userInput;
        }
      },

      cancelEditing() {
        self._isEditing = false;
        self._currentInput = "";
      },

      // Abort any in-flight generate fetch (used on unmount and before delete).
      abortGenerate() {
        if (self._generateController) {
          self._generateController.abort();
          self._generateController = null;
        }
      },

      deleteSubmission() {
        if (self.submission) {
          // Cancel any in-flight generate for this submission before nulling it.
          self.abortGenerate();

          // self.result can throw if not attached to a real annotation tree yet.
          try {
            if (self.result) {
              self.result.area.deleteRegion();
            }
          } catch (e) {
            // no attached annotation store; nothing to delete
          }

          self.submission = null;
          self._currentInput = "";
          self._isEditing = false;
          self._generationCount = 0;
          self.updateResult();
        }
      },

      generateResponse: flow(function* generateResponse() {
        if (!self._currentInput.trim()) {
          InfoModal.warning("Please enter some text");
          return;
        }

        const userInput = self._currentInput.trim();
        const finalPrompt = self.buildPrompt(userInput);

        // Create or update submission
        if (!self.submission) {
          self.submission = LLMSubmission.create({
            id: guidGenerator(),
            userInput,
            prompt: finalPrompt,
            responses: [],
            status: "loading",
            error: null,
            timestamp: Date.now(),
          });
        } else {
          self.submission.updateInput(userInput, finalPrompt);
          self.submission.clearResponses();
          self.submission.setLoading();
        }

        self._isEditing = false;

        let cfg;

        try {
          cfg = getForteRuntime();
        } catch (e) {
          if (isAlive(self) && self.submission) self.submission.setError(e.message);
          return;
        }

        // Create a fresh AbortController for this request.
        self.abortGenerate();
        const controller = new AbortController();
        self._generateController = controller;

        try {
          const requestBody = {
            prompt: finalPrompt,
            num_responses: self.numResponsesInt,
            task_id: self.annotation?.store?.task?.id,
            annotation_id: self.annotation?.id,
          };

          const response = yield fetch(generateEndpoint(cfg), {
            method: "POST",
            headers: forteAuthHeaders(cfg),
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          // Guard: model may have been destroyed or submission deleted while awaiting.
          if (!isAlive(self) || !self.submission) return;

          if (!response.ok) {
            const errorData = yield response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          const data = yield response.json();

          if (!isAlive(self) || !self.submission) return;

          if (data.error) {
            throw new Error(data.error);
          }

          self.submission.setSuccess();
          self._generationCount += 1;

          if (data.responses && Array.isArray(data.responses)) {
            data.responses.forEach((resp) => {
              self.submission.addResponse(
                resp.text || resp.response || "",
                resp.metadata || { model: resp.model, tokens: resp.tokens },
              );
            });
          } else {
            const responseText = data.response || data.text || "";
            self.submission.addResponse(responseText, { model: data.model, tokens: data.tokens });
          }

          self.updateResult();
        } catch (error) {
          if (!isAlive(self) || !self.submission) return;
          self.submission.setError(error.message);
        } finally {
          if (isAlive(self) && self._generateController === controller) {
            self._generateController = null;
          }
        }
      }),

      needsUpdate() {
        if (self.result) {
          self.updateFromResult(self.result.mainValue);
        }
      },

      updateFromResult(value) {
        if (!value) {
          self.submission = null;
          self._currentInput = "";
          return;
        }

        self.submission = LLMSubmission.create({
          id: guidGenerator(),
          userInput: value.user_input || "",
          prompt: value.prompt || "",
          responses: (value.responses || []).map((r) => ({
            text: r.text,
            metadata: r.metadata || {},
          })),
          status: "success",
          error: null,
          timestamp: value.timestamp || Date.now(),
        });
      },

      requiredModal() {
        InfoModal.warning(self.requiredmessage || `Input for "${self.name}" is required.`);
      },

      validate() {
        // Block submit while a generate is in flight.
        if (self.isLoading) {
          InfoModal.warning("Please wait for the LLM response to finish before submitting.");
          return false;
        }
        // Block submit if the user has typed input but hasn't generated yet.
        if (self._currentInput.trim() && !self.submission) {
          InfoModal.warning("Please generate a response before submitting.");
          return false;
        }
        return Super.validate();
      },

      beforeSend() {
        // validate() handles all blocking; nothing extra needed here.
      },

      getSelectedString() {
        if (!self.submission) return "";
        return `${self.submission.responses.length} response(s)`;
      },

      unselectAll() {
        // Required by ControlBase
      },
    };
  });

const LLMTextAreaModel = types.compose(
  "LLMTextAreaModel",
  ControlBase,
  ClassificationBase,
  TagAttrs,
  RequiredMixin,
  PerRegionMixin,
  ReadOnlyControlMixin,
  AnnotationMixin,
  Model,
);

// React Component
const HtxLLMTextArea = observer(({ item }) => {
  const isReadOnly = item.isReadOnly();
  const isEditing = item._isEditing || !item.hasSubmitted;
  const visibleStyle = item.perRegionVisible() ? {} : { display: "none" };

  useEffect(() => {
    return () => {
      item.abortGenerate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lsf-llm-textarea" style={visibleStyle} ref={item.elementRef}>
      {isEditing && (
        <div className="lsf-llm-textarea__input">
          <div className="lsf-llm-textarea__label">{item.label}</div>
          <TextArea
            value={item._currentInput}
            rows={Number.parseInt(item.rows)}
            placeholder={item.placeholder || "Enter your input..."}
            disabled={item.isLoading || isReadOnly}
            onChange={(e) => item.setValue(e.target.value)}
            style={{ marginBottom: "10px" }}
          />

          <Space>
            <Button
              type="primary"
              onClick={() => item.generateResponse()}
              loading={item.isLoading}
              disabled={!item._currentInput.trim() || isReadOnly || !item.canSubmit}
            >
              {item.isLoading ? "Generating..." : "Generate Response"}
            </Button>

            {item.hasSubmitted && <Button onClick={() => item.cancelEditing()}>Cancel</Button>}
          </Space>
        </div>
      )}

      {item.submission && !isEditing && (
        <div className="lsf-llm-textarea__submission">
          <Card
            size="small"
            title={
              <Space>
                <span>Submission</span>
                {item.submission.status === "loading" && <Spin size="small" />}
                {item.submission.status === "success" && <CheckOutlined />}
              </Space>
            }
            extra={
              !isReadOnly && (
                <Space>
                  {item.editable && item.canSubmit && item.submission.status !== "loading" && (
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => item.startEditing()}>
                      Edit
                    </Button>
                  )}
                  {item.submission.status === "error" && (
                    <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => item.generateResponse()}>
                      Retry
                    </Button>
                  )}
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={item.isLoading}
                    onClick={() => {
                      if (window.confirm("Delete this submission?")) {
                        item.deleteSubmission();
                      }
                    }}
                  >
                    Delete
                  </Button>
                </Space>
              )
            }
          >
            <div className="lsf-llm-textarea__user-input">
              <Text strong>Your Input:</Text>
              <div className="lsf-llm-textarea__user-input-text">{item.submission.userInput}</div>
            </div>

            {item.submission.status === "loading" && (
              <div className="lsf-llm-textarea__loading">
                <Spin size="large" />
                <div>
                  <Text type="secondary">
                    Generating {item.numResponsesInt} response{item.numResponsesInt > 1 ? "s" : ""}...
                  </Text>
                </div>
              </div>
            )}

            {item.submission.status === "error" && (
              <Alert
                message="Generation Failed"
                description={item.submission.error}
                type="error"
                showIcon
                action={
                  <Button size="small" onClick={() => item.generateResponse()}>
                    Retry
                  </Button>
                }
              />
            )}

            {item.submission.status === "success" && item.submission.responses.length > 0 && (
              <div className="lsf-llm-textarea__responses">
                <Text strong>
                  {item.submission.responses.length > 1
                    ? `LLM Responses (${item.submission.responses.length}):`
                    : "LLM Response:"}
                </Text>

                {item.submission.responses.map((response, idx) => (
                  <div key={idx} className="lsf-llm-textarea__response-item">
                    {item.submission.responses.length > 1 && (
                      <Text strong style={{ display: "block", marginBottom: "8px" }}>
                        Response {idx + 1}:
                      </Text>
                    )}
                    <div className="lsf-llm-textarea__response-text">{response.text}</div>

                    {response.metadata && (response.metadata.model || response.metadata.tokens) && (
                      <div className="lsf-llm-textarea__response-meta">
                        <Text type="secondary" style={{ fontSize: "0.85em" }}>
                          {response.metadata.model && `Model: ${response.metadata.model}`}
                          {response.metadata.tokens && ` • Tokens: ${response.metadata.tokens}`}
                        </Text>
                      </div>
                    )}
                  </div>
                ))}

                <div className="lsf-llm-textarea__timestamp">
                  <Text type="secondary" style={{ fontSize: "0.85em" }}>
                    Generated {new Date(item.submission.timestamp).toLocaleString()}
                  </Text>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
});

Registry.addTag("llmtextarea", LLMTextAreaModel, HtxLLMTextArea);

export { LLMTextAreaModel, HtxLLMTextArea };
