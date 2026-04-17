import type { TileId } from '../game/tiles'
import { getTileDef } from '../game/tiles'
import TileGraphic from './TileGraphic'

interface Props {
  id: TileId
  onClick?: (id: TileId) => void
  disabled?: boolean
  back?: boolean
  selected?: boolean
  highlight?: boolean
  glow?: boolean
}

export default function Tile({ id, onClick, disabled, back, selected, highlight, glow }: Props) {
  if (back) {
    return <div className="tile back" aria-label="背面" />
  }
  const def = getTileDef(id)
  return (
    <div
      className={`tile ${disabled ? 'disabled' : ''} ${selected ? 'selected' : ''} ${highlight ? 'highlight' : ''} ${glow ? 'glow' : ''}`}
      title={def.label}
      onClick={() => !disabled && onClick?.(id)}
      role="button"
      aria-label={def.label}
    >
      <TileGraphic id={id} />
    </div>
  )
}
