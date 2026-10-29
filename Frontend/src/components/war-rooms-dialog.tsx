import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

export interface WarRoomsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Legacy WarRoomsDialog shim.
 * Active War Rooms has been migrated to a dedicated full-page experience at /war-rooms.
 * If any legacy caller renders this component with open=true, it seamlessly navigates
 * to /war-rooms rather than displaying a legacy popup modal.
 */
export function WarRoomsDialog({ open, onOpenChange }: WarRoomsDialogProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      onOpenChange(false);
      void navigate({ to: '/war-rooms' });
    }
  }, [open, navigate, onOpenChange]);

  return null;
}
