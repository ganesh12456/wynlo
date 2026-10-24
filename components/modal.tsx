'use client';
import { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, children, onClose }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null), titleId = useId();
    useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
    return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose} onClick={e => { if (e.target === ref.current)
        onClose(); }}><div className="modal-head"><span className="eyebrow">WYNLO / DECISION STUDIO</span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><h2 id={titleId}>{title}</h2>{children}</dialog>;
}
