import catAvatar from '../assets/avatars/cat.svg'
import pandaAvatar from '../assets/avatars/panda.svg'
import foxAvatar from '../assets/avatars/fox.svg'
import bearAvatar from '../assets/avatars/bear.svg'

const AVATARS = [catAvatar, pandaAvatar, foxAvatar, bearAvatar]
const NAMES = ['貓', '熊貓', '狐狸', '熊']

interface Props {
  open: boolean
  current: 0 | 1 | 2 | 3
  onPick: (avatar: 0 | 1 | 2 | 3) => void
  onClose: () => void
}

export default function AvatarPicker({ open, current, onPick, onClose }: Props) {
  if (!open) return null
  return (
    <div className="avatar-picker-overlay" onClick={onClose}>
      <div className="avatar-picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-picker-header">
          <h3>選擇頭像</h3>
          <button className="avatar-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="avatar-picker-grid">
          {AVATARS.map((src, i) => {
            const idx = i as 0 | 1 | 2 | 3
            return (
              <button
                key={i}
                className={`avatar-picker-item ${current === idx ? 'active' : ''}`}
                onClick={() => { onPick(idx); onClose() }}
              >
                <img src={src} alt={NAMES[i]} />
                <div className="avatar-picker-name">{NAMES[i]}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
