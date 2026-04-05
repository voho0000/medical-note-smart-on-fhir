extends Node
class_name TeahouseManager
## 茶館基地系統
## 管理茶館升級階段、掛機產出、隨機事件

signal teahouse_upgraded(new_level: int)
signal resource_produced(resource_name: String, amount: int)
signal random_event_triggered(event_data: Dictionary)

# 茶館五個成長階段
const STAGE_DATA: Array = [
	{  # 第一階段：廢棄老店
		"name": "廢棄老店",
		"tables": 2,
		"unlocks": ["大廳", "簡易廚房"],
		"idle_output": {"草藥": 5, "茶葉": 3},
		"upgrade_cost": {"靈石": 100},
	},
	{  # 第二階段：半開張
		"name": "半開張",
		"tables": 5,
		"unlocks": ["靈藥釀造室", "庭院種植槽"],
		"idle_output": {"靈石": 2, "靈草": 4},
		"upgrade_cost": {"靈石": 500, "古法材料": 10},
	},
	{  # 第三階段：靈界名所
		"name": "靈界名所",
		"tables": 8,
		"unlocks": ["二樓包廂", "奶奶的舊房間"],
		"idle_output": {"古法材料": 2, "稀有靈石": 1},
		"upgrade_cost": {"靈石": 2000, "稀有靈石": 20},
	},
	{  # 第四階段：盟約聖地
		"name": "盟約聖地",
		"tables": 12,
		"unlocks": ["地下密室", "靈界通道"],
		"idle_output": {"傳說材料": 1, "稀有靈石": 3},
		"upgrade_cost": {"稀有靈石": 100, "傳說材料": 5},
	},
	{  # 第五階段：兩界守望者
		"name": "兩界守望者",
		"tables": 16,
		"unlocks": ["天台靈台", "全館完全解鎖"],
		"idle_output": {"傳說材料": 3, "稀有靈石": 5},
		"upgrade_cost": {},  # 最終階段
	},
]

var current_stage: int = 0  # 0-indexed
var last_collect_time: float = 0.0
var idle_accumulator: Dictionary = {}

func _ready() -> void:
	last_collect_time = Time.get_unix_time_from_system()

func get_stage_data() -> Dictionary:
	return STAGE_DATA[current_stage]

func get_stage_name() -> String:
	return STAGE_DATA[current_stage]["name"]

func can_upgrade() -> bool:
	if current_stage >= STAGE_DATA.size() - 1:
		return false
	var cost = STAGE_DATA[current_stage]["upgrade_cost"]
	# TODO: 檢查玩家是否有足夠材料
	return true

func upgrade() -> bool:
	if not can_upgrade():
		return false
	current_stage += 1
	teahouse_upgraded.emit(current_stage + 1)
	return true

func collect_idle_resources() -> Dictionary:
	var now = Time.get_unix_time_from_system()
	var elapsed_minutes = (now - last_collect_time) / 60.0
	last_collect_time = now

	var output = STAGE_DATA[current_stage]["idle_output"]
	var collected: Dictionary = {}

	for resource_name in output:
		var amount = int(output[resource_name] * elapsed_minutes)
		if amount > 0:
			collected[resource_name] = amount
			resource_produced.emit(resource_name, amount)

	return collected

# === 隨機茶館事件 ===
const RANDOM_EVENTS: Array = [
	{
		"id": "mysterious_guest",
		"name": "神秘訪客",
		"description": "一位不願透露姓名的客人來到茶館...",
		"effect": {"靈石": 50},
	},
	{
		"id": "fox_cooking",
		"name": "茴的料理",
		"description": "茴心血來潮做了一道靈界小菜。",
		"effect": {"茶葉": 20},
	},
	{
		"id": "teahouse_whisper",
		"name": "茶館的低語",
		"description": "你隱約聽見茶館在對你說什麼...",
		"effect": {"story_hint": true},
	},
]

func roll_daily_event() -> Dictionary:
	var event = RANDOM_EVENTS[randi() % RANDOM_EVENTS.size()]
	random_event_triggered.emit(event)
	return event
