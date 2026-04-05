extends Node2D
class_name EnemyBattle
## 戰鬥中的敵人實例
## 包含意圖預告系統

signal hp_changed(current_hp: int, max_hp: int)
signal enemy_died()
signal intent_revealed(intent: String)

var enemy_name: String = ""
var element: BattleManager.Element = BattleManager.Element.NONE
var max_hp: int = 0
var current_hp: int = 0
var atk: int = 0
var def_stat: int = 0
var spd: int = 0
var is_alive: bool = true

var intent_pool: Array = []
var current_intent: String = ""  # 預告下回合意圖
var is_stunned: bool = false     # 崩潰狀態（跳過回合）

func initialize(data: Dictionary) -> void:
	enemy_name = data.get("name", "未知敵人")
	element = data.get("element", BattleManager.Element.NONE)
	max_hp = data.get("hp", 100)
	current_hp = max_hp
	atk = data.get("atk", 10)
	def_stat = data.get("def", 10)
	spd = data.get("spd", 10)
	intent_pool = data.get("intent_pool", ["attack"])
	_roll_intent()

func take_damage(damage: int) -> int:
	var actual_damage = maxi(1, damage - def_stat / 4)
	current_hp = maxi(0, current_hp - actual_damage)
	hp_changed.emit(current_hp, max_hp)

	if current_hp <= 0:
		is_alive = false
		enemy_died.emit()

	return actual_damage

func execute_turn(targets: Array[CharacterBattle]) -> Dictionary:
	var result: Dictionary = {"action": current_intent, "damage": 0, "target": ""}

	if is_stunned:
		is_stunned = false
		result["action"] = "stunned"
		_roll_intent()
		return result

	match current_intent:
		"attack":
			if targets.size() > 0:
				var target = targets[randi() % targets.size()]
				var element_mult = BattleManager.get_element_multiplier(element, target.element)
				var damage = int(atk * element_mult)
				result["damage"] = target.take_damage(damage)
				result["target"] = target.character_name
		"defend":
			# 防禦：本回合減傷 50%
			result["action"] = "defend"
		"charge":
			# 蓄力：下回合攻擊 x2
			result["action"] = "charge"

	_roll_intent()
	return result

func apply_collapse() -> void:
	## 被破防連擊命中，下回合跳過
	is_stunned = true

func _roll_intent() -> void:
	if intent_pool.size() > 0:
		current_intent = intent_pool[randi() % intent_pool.size()]
	else:
		current_intent = "attack"
	intent_revealed.emit(current_intent)

func get_intent_display() -> String:
	match current_intent:
		"attack": return "⚔️ 準備攻擊"
		"defend": return "🛡️ 準備防禦"
		"charge": return "💫 正在蓄力"
		_: return "❓ 未知"
