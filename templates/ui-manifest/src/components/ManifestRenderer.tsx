import { useState } from "react";
import { UiManifest, Field } from "@/lib/manifest/schema";

interface ManifestRendererProps {
  manifest: UiManifest;
  onSubmit: (values: Record<string, unknown>) => Promise<unknown>;
  disabled?: boolean;
}

/**
 * Manifest Renderer — Auto-generated UI from agent manifest
 * 
 * Renders the appropriate interface based on displayMode:
 * - form: Standard form with all fields
 * - chat: Single text input (uses first text field)
 * - wizard: Multi-step form (one field per step)
 * - viewer: Read-only display
 */
export function ManifestRenderer({ manifest, onSubmit, disabled }: ManifestRendererProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await onSubmit(values);
      setResult(response);
    } finally {
      setLoading(false);
    }
  };

  const updateValue = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  if (manifest.displayMode === "chat") {
    return (
      <ChatRenderer
        fields={manifest.fields}
        values={values}
        onChange={updateValue}
        onSubmit={handleSubmit}
        result={result}
        loading={loading}
        disabled={disabled}
      />
    );
  }

  if (manifest.displayMode === "wizard") {
    return (
      <WizardRenderer
        fields={manifest.fields}
        values={values}
        onChange={updateValue}
        onSubmit={handleSubmit}
        result={result}
        loading={loading}
        disabled={disabled}
      />
    );
  }

  // Default: form mode
  return (
    <FormRenderer
      fields={manifest.fields}
      values={values}
      onChange={updateValue}
      onSubmit={handleSubmit}
      result={result}
      loading={loading}
      disabled={disabled}
    />
  );
}

function FormRenderer({
  fields,
  values,
  onChange,
  onSubmit,
  result,
  loading,
  disabled,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  onSubmit: () => void;
  result: unknown;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(value) => onChange(field.name, value)}
          disabled={disabled}
        />
      ))}

      <button
        onClick={onSubmit}
        disabled={loading || disabled}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Submit"}
      </button>

      {result && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ChatRenderer({
  fields,
  values,
  onChange,
  onSubmit,
  result,
  loading,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  onSubmit: () => void;
  result: unknown;
  loading: boolean;
  disabled?: boolean;
}) {
  // Use first text/textarea field as chat input
  const chatField = fields.find((f) => f.type === "text" || f.type === "textarea");

  return (
    <div className="space-y-4">
      {result && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={String(values[chatField?.name || "input"] || "")}
          onChange={(e) => onChange(chatField?.name || "input", e.target.value)}
          placeholder={chatField?.description || "Type your message..."}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
        <button
          onClick={onSubmit}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function WizardRenderer({
  fields,
  values,
  onChange,
  onSubmit,
  result,
  loading,
}: {
  fields: Field[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  onSubmit: () => void;
  result: unknown;
  loading: boolean;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(0);
  const currentField = fields[step];
  const isLastStep = step === fields.length - 1;

  if (result) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <pre className="text-sm text-gray-300 whitespace-pre-wrap">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        Step {step + 1} of {fields.length}
      </div>

      {currentField && (
        <FieldInput
          field={currentField}
          value={values[currentField.name]}
          onChange={(value) => onChange(currentField.name, value)}
        />
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-gray-300 hover:bg-gray-700"
          >
            Back
          </button>
        )}
        {isLastStep ? (
          <button
            onClick={onSubmit}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Submit"}
          </button>
        ) : (
          <button
            onClick={() => setStep(step + 1)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const baseClasses =
    "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50";

  switch (field.type) {
    case "text":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          {field.description && (
            <p className="mb-1 text-xs text-gray-500">{field.description}</p>
          )}
          <input
            type="text"
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
            required={field.required}
          />
        </div>
      );

    case "textarea":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <textarea
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`${baseClasses} min-h-[100px] resize-y`}
            required={field.required}
          />
        </div>
      );

    case "url":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            type="url"
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
            required={field.required}
            placeholder="https://..."
          />
        </div>
      );

    case "number":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            type="number"
            value={Number(value) || ""}
            onChange={(e) => onChange(Number(e.target.value))}
            disabled={disabled}
            className={baseClasses}
            required={field.required}
          />
        </div>
      );

    case "select":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <select
            value={String(value || "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
            required={field.required}
          >
            <option value="">Select...</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );

    case "toggle":
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          <label className="text-sm text-gray-300">{field.label}</label>
        </div>
      );

    case "readonly":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">{field.label}</label>
          <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-400">
            {String(value || "—")}
          </div>
        </div>
      );

    default:
      return null;
  }
}
