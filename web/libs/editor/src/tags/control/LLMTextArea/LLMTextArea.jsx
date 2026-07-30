import { observer } from "mobx-react";
import { types } from "mobx-state-tree";
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

import "./LLMTextArea.scss";

const { TextArea } = Input;
const { Text } = Typography;

/**
 * Reads runtime request config from `window.ForteUpload` (set by the host
 * app; shared with `FileUpload.jsx`). Never read from XML attributes, since
 * host/auth/assignment info must not be baked into per-batch Forte XML.
 *
 * ```js
 * window.ForteUpload = {
 *   baseUrl: "https://forte-backend.example.com",
 *   token: "<knox-token>", // "Token "-prefixed value also accepted
 *   assignmentId: "123",
 * };
 * ```
 */
function getRuntimeConfig() {
  const cfg = typeof window !== "undefined" ? window.ForteUpload : undefined;

  if (!cfg || !cfg.baseUrl || !cfg.token || !cfg.assignmentId) {
    throw new Error(
      "LLMTextArea: window.ForteUpload = {baseUrl, token, assignmentId} must be configured before use",
    );
  }
  return cfg;
}

function generateEndpoint(cfg) {
  return `${cfg.baseUrl}/api/v1/active-assignments/${cfg.assignmentId}/llm/generate/`;
}

function authHeaders(cfg) {
  const token = cfg.token.startsWith("Token ") ? cfg.token : `Token ${cfg.token}`;
  return {
    "Content-Type": "application/json",
    Authorization: token,
  };
}

/**
 * The `LLMTextArea` tag displays a text area that generates LLM responses on submit.
 * Use for tasks requiring LLM-assisted annotation, response generation, or interactive prompting.
 *
 * Use with the following data types: text, image, audio, video, HTML.
 *
 * Endpoint and auth come from `window.ForteUpload` at runtime, never XML attributes
 * (see `getRuntimeConfig`).
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
  toname: types.string,
  prompttemplate: types.string,
  numresponses: types.optional(types.string, "1"),
  maxsubmissions: types.optional(types.string, "1"),
  editable: types.optional(types.boolean, true),
  rows: types.optional(types.string, "3"),
  placeholder: types.maybeNull(types.string),
  label: types.optional(types.string, "Your Input"),
});

// Single submission that holds user input + LLM responses
const LLMSubmission = types.model("LLMSubmission", {
  id: types.identifier,
  userInput: types.string,
  prompt: types.string, // Processed prompt sent to backend
  responses: types.array(types.model("LLMResponse", {
    text: types.string,
    metadata: types.frozen(), // model, tokens, etc
  })),
  status: types.enumeration("LLMStatus", ['idle', 'loading', 'success', 'error']),
  error: types.maybeNull(types.string),
  timestamp: types.number,
})
  .actions((self) => ({
    setLoading() {
      self.status = 'loading';
      self.error = null;
    },

    setSuccess() {
      self.status = 'success';
      self.error = null;
    },

    setError(errorMessage) {
      self.status = 'error';
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
  })
  .views((self) => ({
    get holdsState() {
      return self.submission !== null;
    },

    get hasSubmitted() {
      return self.submission !== null;
    },

    get canSubmit() {
      const max = Number.parseInt(self.maxsubmissions);
      return !self.hasSubmitted || (self.editable && max > 1);
    },

    get isLoading() {
      return self.submission?.status === 'loading';
    },

    get numResponsesInt() {
      return Math.min(Math.max(Number.parseInt(self.numresponses) || 1, 1), 5);
    },

    selectedValues() {
      if (!self.submission) return null;

      return {
        user_input: self.submission.userInput,
        prompt: self.submission.prompt,
        responses: self.submission.responses.map(r => ({
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
      if (template.startsWith('$')) {
        template = parseValue(template, self.annotation?.store?.task?.dataObj ?? {});
      }

      // If template is still not a string (e.g., undefined), use empty string
      if (typeof template !== 'string') {
        template = '';
      }

      // Replace {{input}} with user input
      let prompt = template.replace(/\{\{input\}\}/g, userInput);

      // Replace {{text}} or other task data fields if needed
      // This allows templates like "Summarize: {{text}}\n\nUser question: {{input}}"
      const taskData = self.annotation?.store?.task?.dataObj ?? {};
      prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return taskData[key] ?? match;
      });

      return prompt;
    },
  }))
  .actions((self) => ({
    setValue(value) {
      self._currentInput = value;
    },

    startEditing() {
      if (self.submission && self.editable && !self.isReadOnly()) {
        self._isEditing = true;
        self._currentInput = self.submission.userInput;
      }
    },

    cancelEditing() {
      self._isEditing = false;
      self._currentInput = "";
    },

    deleteSubmission() {
      if (self.submission) {
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
        self.updateResult();
      }
    },

    async generateResponse() {
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
          status: 'loading',
          error: null,
          timestamp: Date.now(),
        });
      } else {
        // Editing: update values
        self.submission.updateInput(userInput, finalPrompt);
        self.submission.clearResponses();
        self.submission.setLoading();
      }

      self._isEditing = false;

      let cfg;

      try {
        cfg = getRuntimeConfig();
      } catch (e) {
        self.submission.setError(e.message);
        return;
      }

      try {
        const requestBody = {
          prompt: finalPrompt,
          num_responses: self.numResponsesInt,
          task_id: self.annotation?.store?.task?.id,
          annotation_id: self.annotation?.id,
        };

        const response = await fetch(generateEndpoint(cfg), {
          method: 'POST',
          headers: authHeaders(cfg),
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Update submission with responses
        self.submission.setSuccess();

        if (data.responses && Array.isArray(data.responses)) {
          data.responses.forEach(resp => {
            self.submission.addResponse(
              resp.text || resp.response || '',
              resp.metadata || { model: resp.model, tokens: resp.tokens }
            );
          });
        } else {
          // Handle single response format
          const responseText = data.response || data.text || '';
          self.submission.addResponse(
            responseText,
            { model: data.model, tokens: data.tokens }
          );
        }

        // Update annotation result
        self.updateResult();

      } catch (error) {
        console.error('LLM generation failed:', error);
        self.submission.setError(error.message);
      }
    },

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

      // Restore from saved annotation
      self.submission = LLMSubmission.create({
        id: guidGenerator(),
        userInput: value.user_input || "",
        prompt: value.prompt || "",
        responses: (value.responses || []).map(r => ({
          text: r.text,
          metadata: r.metadata || {},
        })),
        status: 'success',
        error: null,
        timestamp: value.timestamp || Date.now(),
      });
    },

    requiredModal() {
      InfoModal.warning(self.requiredmessage || `Input for "${self.name}" is required.`);
    },

    beforeSend() {
      // If user has input but hasn't generated, warn them
      if (self._currentInput && !self.submission) {
        InfoModal.warning("Please generate a response before submitting.");
      }
    },

    getSelectedString() {
      if (!self.submission) return "";
      return `${self.submission.responses.length} response(s)`;
    },

    unselectAll() {
      // Required by ControlBase
    },
  }));

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

  return (
    <div className="llm-textarea" style={visibleStyle} ref={item.elementRef}>
      {/* Input Section (shown when editing or no submission) */}
      {isEditing && (
        <div className="llm-textarea__input">
          <div className="llm-textarea__label">{item.label}</div>
          <TextArea
            value={item._currentInput}
            rows={Number.parseInt(item.rows)}
            placeholder={item.placeholder || "Enter your input..."}
            disabled={item.isLoading || isReadOnly}
            onChange={(e) => item.setValue(e.target.value)}
            style={{ marginBottom: '10px' }}
          />

          <Space>
            <Button
              type="primary"
              onClick={() => item.generateResponse()}
              loading={item.isLoading}
              disabled={!item._currentInput.trim() || isReadOnly}
            >
              {item.isLoading ? 'Generating...' : 'Generate Response'}
            </Button>

            {item.hasSubmitted && (
              <Button onClick={() => item.cancelEditing()}>
                Cancel
              </Button>
            )}
          </Space>
        </div>
      )}

      {/* Submission Display */}
      {item.submission && !isEditing && (
        <div className="llm-textarea__submission">
          <Card
            size="small"
            title={
              <Space>
                <span>Submission</span>
                {item.submission.status === 'loading' && <Spin size="small" />}
                {item.submission.status === 'success' && <CheckOutlined style={{ color: '#52c41a' }} />}
              </Space>
            }
            extra={
              !isReadOnly && (
                <Space>
                  {item.editable && item.submission.status !== 'loading' && (
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => item.startEditing()}
                    >
                      Edit
                    </Button>
                  )}
                  {item.submission.status === 'error' && (
                    <Button
                      type="text"
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => item.generateResponse()}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      if (window.confirm('Delete this submission?')) {
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
            {/* User Input */}
            <div className="llm-textarea__user-input">
              <Text strong>Your Input:</Text>
              <div style={{
                padding: '8px',
                background: '#f5f5f5',
                borderRadius: '4px',
                marginTop: '4px',
                marginBottom: '12px',
                whiteSpace: 'pre-wrap',
              }}>
                {item.submission.userInput}
              </div>
            </div>

            {/* Loading State */}
            {item.submission.status === 'loading' && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="large" />
                <div style={{ marginTop: '10px' }}>
                  <Text type="secondary">Generating {item.numResponsesInt} response{item.numResponsesInt > 1 ? 's' : ''}...</Text>
                </div>
              </div>
            )}

            {/* Error State */}
            {item.submission.status === 'error' && (
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

            {/* Success - Show Responses */}
            {item.submission.status === 'success' && item.submission.responses.length > 0 && (
              <div className="llm-textarea__responses">
                <Text strong>
                  {item.submission.responses.length > 1
                    ? `LLM Responses (${item.submission.responses.length}):`
                    : 'LLM Response:'
                  }
                </Text>

                {item.submission.responses.map((response, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      background: '#fafafa',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      marginTop: '8px',
                    }}
                  >
                    {item.submission.responses.length > 1 && (
                      <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                        Response {idx + 1}:
                      </Text>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {response.text}
                    </div>

                    {response.metadata && (response.metadata.model || response.metadata.tokens) && (
                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e8e8e8' }}>
                        <Text type="secondary" style={{ fontSize: '0.85em' }}>
                          {response.metadata.model && `Model: ${response.metadata.model}`}
                          {response.metadata.tokens && ` • Tokens: ${response.metadata.tokens}`}
                        </Text>
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ marginTop: '8px' }}>
                  <Text type="secondary" style={{ fontSize: '0.85em' }}>
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
