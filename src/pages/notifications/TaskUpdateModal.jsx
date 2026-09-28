import { Modal } from "antd";
import TaskUpdateView from "./TaskUpdateView";

// The status update a task_update notification points at, opened from My
// Notifications. The same view sits in My Tasks' Sent to me tab.
export default function TaskUpdateModal({ deliveryId, open, onClose, onActed }) {
  return (
    <Modal
      title="Task Status Update"
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnHidden
      centered
    >
      <div style={{ marginTop: 8 }}>
        {open && deliveryId && <TaskUpdateView deliveryId={deliveryId} onActed={() => onActed?.()} />}
      </div>
    </Modal>
  );
}
