'use client';
import {useId} from 'react';
import {classifyContents, releaseKinds, releaseKindLabels, type ClassificationPart, type ReleaseKind} from '@/lib/catalog-classification';
import {FieldGuidance} from '@/components/field-guidance';

export function CatalogClassification({parts, kind, mode, complete, onChange}: {
  parts: ClassificationPart[]; kind: ReleaseKind; mode: 'automatic' | 'manual'; complete: boolean;
  onChange: (mode: 'automatic' | 'manual', kind: ReleaseKind) => void;
}) {
  const id = useId(), result = classifyContents(parts, complete, kind);
  return <section className="catalog-classification wide">
    <div className="catalog-choice-heading"><h3>Classification</h3><FieldGuidance label="Classification" text="Automatic classification uses physical contents and expected quantities, not the number of part rows or Main Component checkboxes. Packaging and paperwork are ignored. Figures with a vehicle or equipment remain part of that set. Playset environments take precedence. Incomplete lists and unknown quantities remain provisional. Use an override only for unusual releases."/></div>
    <p role="status"><strong>{mode === 'automatic' ? result.label : releaseKindLabels[kind]}</strong>{mode === 'automatic' ? result.provisional ? ' — provisional' : ' — automatic' : ' — manual override'}</p>
    <p>{result.summary}</p>
    <div className="catalog-choice"><label htmlFor={id}>Classification override</label><select id={id} value={mode === 'automatic' ? 'automatic' : kind} onChange={event => event.target.value === 'automatic' ? onChange('automatic', result.kind) : onChange('manual', event.target.value as ReleaseKind)}>
      <option value="automatic">Automatic from contents (recommended)</option>
      {releaseKinds.map(value => <option key={value} value={value}>{releaseKindLabels[value]} — manual override</option>)}
    </select></div>
  </section>;
}
