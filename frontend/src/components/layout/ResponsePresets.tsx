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
import { WandSparkles } from "lucide-react";
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
      <Button
        aria-label="Response presets"
        size="sm"
        variant="flat"
        color="primary"
        startContent={<WandSparkles size={15} />}
        isDisabled={disabled}
        onPress={() => {
          setError("");
          setOpen(true);
        }}
      >
        Presets
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="lg"
        backdrop="blur"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex-col gap-1">
            <span>Response cookbook</span>
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
              Applying replaces this file’s draft body, status and headers.
              Review the draft and press Save to publish it.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button color="primary" onPress={apply}>
              Apply to draft
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
