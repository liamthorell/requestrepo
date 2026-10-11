import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { ListPlus } from "lucide-react";
import { RESPONSE_PRESETS, responsePreset, type PresetKey } from "@/lib/qol";

export function ResponsePresets({
  fileName,
  disabled,
  onApply,
}: {
  fileName: string;
  disabled: boolean;
  onApply: (draft: ReturnType<typeof responsePreset>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PresetKey>("html");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const apply = () => {
    try {
      onApply(responsePreset(selected, target));
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check the redirect URL.",
      );
    }
  };
  return (
    <>
      <button
        type="button"
        aria-label="Response presets"
        className="text-btn"
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <ListPlus size={14} />
        Presets
      </button>
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex-col gap-1">
            <span>Start from a preset</span>
            <span className="font-mono text-xs font-normal text-default-500">
              {fileName}
            </span>
          </ModalHeader>
          <ModalBody>
            <div className="preset-grid">
              {RESPONSE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.key}
                  aria-pressed={selected === preset.key}
                  onClick={() => {
                    setSelected(preset.key);
                    setError("");
                  }}
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.detail}</span>
                </button>
              ))}
            </div>
            {selected === "redirect" && (
              <Input
                label="Redirect target"
                placeholder="https://example.com/path"
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  setError("");
                }}
                isInvalid={!!error}
                errorMessage={error}
              />
            )}
            <p className="text-sm text-default-500">
              Replaces the body, status and headers in the editor. Nothing is
              served until you save.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={apply}>
              Use preset
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
