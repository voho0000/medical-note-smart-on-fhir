extends Node
## 戰鬥管理器
## 管理回合流程、SP系統、五行相剋

signal turn_started(turn_number: int)
signal turn_ended(turn_number: int)
signal sp_changed(new_value: int)
signal battle_ended(is_victory: bool)

# === SP 系統 ===
const SP_MAX: int = 100
const SP_NORMAL_ATTACK_GAIN: int = 10
const SP_HIT_GAIN: int = 5
const SP_SKILL_COST: int = 25
const SP_BURST_COST: int = 50
const SKILL_COOLDOWN: int = 3
const BURST_COOLDOWN: int = 5

var current_sp: int = 0
var turn_number: int = 0
var is_battle_active: bool = false

# === 五行屬性 ===
enum Element { WOOD, FIRE, WATER, METAL, EARTH, NONE }

# 相剋表：key 剋 value
const ELEMENT_ADVANTAGE: Dictionary = {
	Element.WOOD: Element.EARTH,
	Element.FIRE: Element.METAL,
	Element.WATER: Element.FIRE,
	Element.METAL: Element.WOOD,
	Element.EARTH: Element.WATER,
}

const ELEMENT_NAMES: Dictionary = {
	Element.WOOD: "靈木",
	Element.FIRE: "靈火",
	Element.WATER: "靈水",
	Element.METAL: "靈金",
	Element.EARTH: "靈土",
	Element.NONE: "無屬",
}

const ADVANTAGE_MULTIPLIER: float = 1.5
const DISADVANTAGE_MULTIPLIER: float = 0.7
const RESONANCE_DAMAGE_BONUS: float = 0.3
const RESONANCE_SP_BONUS: int = 15

func start_battle() -> void:
	current_sp = 0
	turn_number = 0
	is_battle_active = true
	_next_turn()

func _next_turn() -> void:
	if not is_battle_active:
		return
	turn_number += 1
	turn_started.emit(turn_number)

func end_turn() -> void:
	turn_ended.emit(turn_number)
	_next_turn()

func end_battle(victory: bool) -> void:
	is_battle_active = false
	battle_ended.emit(victory)

# === SP 操作 ===
func add_sp(amount: int) -> void:
	current_sp = mini(current_sp + amount, SP_MAX)
	sp_changed.emit(current_sp)

func use_sp(amount: int) -> bool:
	if current_sp >= amount:
		current_sp -= amount
		sp_changed.emit(current_sp)
		return true
	return false

func can_use_skill() -> bool:
	return current_sp >= SP_SKILL_COST

func can_use_burst() -> bool:
	return current_sp >= SP_BURST_COST

# === 五行相剋計算 ===
func get_element_multiplier(attacker_element: Element, defender_element: Element) -> float:
	if attacker_element == Element.NONE or defender_element == Element.NONE:
		return 1.0
	if ELEMENT_ADVANTAGE.has(attacker_element) and ELEMENT_ADVANTAGE[attacker_element] == defender_element:
		return ADVANTAGE_MULTIPLIER
	if ELEMENT_ADVANTAGE.has(defender_element) and ELEMENT_ADVANTAGE[defender_element] == attacker_element:
		return DISADVANTAGE_MULTIPLIER
	return 1.0

func get_element_name(element: Element) -> String:
	return ELEMENT_NAMES.get(element, "未知")

func is_advantage(attacker: Element, defender: Element) -> bool:
	return ELEMENT_ADVANTAGE.has(attacker) and ELEMENT_ADVANTAGE[attacker] == defender
