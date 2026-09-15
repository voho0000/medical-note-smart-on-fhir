"use client"

import Image from "next/image"
import { FormEvent, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useFhirContext } from "@/src/application/hooks/chat/use-fhir-context.hook"
import { detectLaunchSource, detectSite } from "@/src/application/telemetry/launch-context"
import { getFeedbackRequestHeaders } from "@/src/application/feedback/feedback-request-headers"
import { useAppVersion } from "@/src/shared/hooks/use-app-version.hook"
import {
  FEEDBACK_IMAGE_ACCEPT,
  MAX_FEEDBACK_IMAGES,
  fileToFeedbackImagePayload,
  prepareFeedbackImage,
  validateFeedbackImageFiles,
  type FeedbackImageValidationError,
} from "@/features/feedback/image-attachments"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SelectedFeedbackImage {
  file: File
  previewUrl: string
}

const INITIAL_FORM_DATA = {
  email: "",
  issueType: "",
  severity: "medium",
  description: "",
  steps: "",
}

const FEEDBACK_TIMEOUT_MS = 30_000

function createReportId(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "")
  const random = globalThis.crypto?.randomUUID?.()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase() ?? Math.random().toString(36).slice(2, 10).toUpperCase()
  return `FB-${date}-${random}`
}

function safeOrigin(value: string | null | undefined): string {
  if (!value) return "not-connected"
  try {
    return new URL(value).origin
  } catch {
    return "not-connected"
  }
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { fhirServerUrl } = useFhirContext()
  const appVersion = useAppVersion()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingImages, setIsPreparingImages] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successReportId, setSuccessReportId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [images, setImages] = useState<SelectedFeedbackImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  const imagesRef = useRef<SelectedFeedbackImage[]>([])
  const imageInputRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const issueTypeRef = useRef<HTMLButtonElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const submitAbortRef = useRef<AbortController | null>(null)
  const activeReportIdRef = useRef<string | null>(null)
  const reporterEmail = emailTouched ? formData.email : (formData.email || user?.email || "")
  const isAiResponseIssue = formData.issueType === "ai"

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort()
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [])

  const imageErrorMessage = (error: FeedbackImageValidationError): string => {
    switch (error.code) {
      case "too-many":
        return (t.feedback?.imageTooMany || "最多可附加 {max} 張圖片")
          .replace("{max}", String(MAX_FEEDBACK_IMAGES))
      case "invalid-type":
        return (t.feedback?.imageInvalidType || "{name} 不是支援的圖片格式")
          .replace("{name}", error.fileName)
      case "empty":
        return (t.feedback?.imageEmpty || "{name} 是空白檔案，請重新選擇")
          .replace("{name}", error.fileName)
      case "total-too-large":
        return t.feedback?.imageTotalTooLarge || "圖片合計不可超過 8 MB"
      case "processing-failed":
        return (t.feedback?.imageProcessingFailed || "無法處理 {name}，請改用其他圖片")
          .replace("{name}", error.fileName)
    }
  }

  const handleImageSelection = async (files: File[]) => {
    if (files.length === 0) return
    const validationError = validateFeedbackImageFiles(
      images.map((image) => image.file),
      files,
    )
    if (validationError) {
      setImageError(imageErrorMessage(validationError))
      return
    }

    setIsPreparingImages(true)
    setImageError(null)
    try {
      const preparedFiles = await Promise.all(files.map(prepareFeedbackImage))
      const preparedValidationError = validateFeedbackImageFiles(
        images.map((image) => image.file),
        preparedFiles,
      )
      if (preparedValidationError) {
        setImageError(imageErrorMessage(preparedValidationError))
        return
      }
      setImages((current) => [
        ...current,
        ...preparedFiles.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ])
    } catch {
      setImageError(imageErrorMessage({
        code: "processing-failed",
        fileName: files[0]?.name || "image",
      }))
    } finally {
      setIsPreparingImages(false)
    }
  }

  const removeImage = (index: number) => {
    setImages((current) => {
      const image = current[index]
      if (image) URL.revokeObjectURL(image.previewUrl)
      return current.filter((_, imageIndex) => imageIndex !== index)
    })
    setImageError(null)
  }

  const clearImages = () => {
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      return []
    })
    setImageError(null)
  }

  const resetDialog = () => {
    submitAbortRef.current?.abort()
    submitAbortRef.current = null
    activeReportIdRef.current = null
    clearImages()
    setFormData({ ...INITIAL_FORM_DATA, email: user?.email ?? "" })
    setErrors({})
    setSubmitError(null)
    setSuccessReportId(null)
    setStepsOpen(false)
    setEmailTouched(false)
    setIsSubmitting(false)
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    if (isSubmitting) return
    resetDialog()
    onOpenChange(false)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    let firstInvalid: HTMLElement | null = null

    if (!reporterEmail) {
      newErrors.email = t.feedback?.emailRequired || "請輸入電子郵件"
      firstInvalid = emailRef.current
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
      newErrors.email = t.feedback?.emailInvalid || "請輸入有效的電子郵件地址"
      firstInvalid = emailRef.current
    }
    if (!formData.issueType) {
      newErrors.issueType = t.feedback?.issueTypeRequired || "請選擇問題類型"
      firstInvalid ??= issueTypeRef.current
    }
    if (!formData.description.trim()) {
      newErrors.description = t.feedback?.descriptionRequired || "請輸入問題描述"
      firstInvalid ??= descriptionRef.current
    } else if (formData.description.trim().length < 20) {
      newErrors.description = t.feedback?.descriptionTooShort || "問題描述至少需要 20 個字元"
      firstInvalid ??= descriptionRef.current
    }
    setErrors(newErrors)
    if (firstInvalid) {
      requestAnimationFrame(() => {
        firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" })
        firstInvalid?.focus()
      })
    }
    return Object.keys(newErrors).length === 0
  }

  const messageForStatus = (status: number): string => {
    if (status === 401 || status === 403) {
      return t.feedback?.errorUnauthorized || "登入狀態已失效，請重新整理後再試。"
    }
    if (status === 413) {
      return t.feedback?.errorTooLarge || "回報或圖片超過大小限制，請縮減後再試。"
    }
    if (status === 429) {
      return t.feedback?.errorRateLimited || "短時間內送出次數過多，請稍後再試。"
    }
    if (status === 503) {
      return t.feedback?.errorUnavailable || "回報服務目前未完成設定，請改用既有聯絡管道。"
    }
    return t.feedback?.errorMessage || "發送失敗，內容仍保留，請稍後再試。"
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    setSubmitError(null)
    const reportId = activeReportIdRef.current ?? createReportId()
    activeReportIdRef.current = reportId
    const controller = new AbortController()
    submitAbortRef.current = controller
    let timeout = 0
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        controller.abort()
        reject(new DOMException("Feedback submission timed out", "AbortError"))
      }, FEEDBACK_TIMEOUT_MS)
    })

    try {
      const [requestHeaders, launchSource, imagePayloads] = await Promise.race([
        Promise.all([
          getFeedbackRequestHeaders(),
          detectLaunchSource(),
          Promise.all(images.map((image) => fileToFeedbackImagePayload(image.file))),
        ]),
        timeoutPromise,
      ])
      const selectedViews = Array.from(
        document.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]'),
      ).map((element) => element.textContent?.trim()).filter(Boolean).join(" > ")
      const systemInfo = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: String(window.devicePixelRatio),
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
        language: navigator.language,
        currentPath: window.location.pathname,
        currentView: selectedViews || "unknown",
        fhirServerOrigin: safeOrigin(fhirServerUrl),
        appVersion: appVersion || "unknown",
        launchSource,
        site: detectSite(),
      }

      const feedbackUrl = process.env.NEXT_PUBLIC_FEEDBACK_URL || "/api/feedback"
      const response = await fetch(feedbackUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          reportId,
          ...formData,
          email: reporterEmail,
          description: formData.description.trim(),
          ...(imagePayloads.length > 0 && { images: imagePayloads }),
          systemInfo,
        }),
        signal: controller.signal,
      })

      const result = await response.json().catch(() => ({})) as {
        success?: boolean
        emailSent?: boolean
        reportId?: string
      }
      if (!response.ok || result.success !== true || result.emailSent === false) {
        setSubmitError(messageForStatus(response.status))
        return
      }

      setSuccessReportId(result.reportId || reportId)
      setFormData({ ...INITIAL_FORM_DATA, email: user?.email ?? "" })
      setEmailTouched(false)
      clearImages()
      setErrors({})
      activeReportIdRef.current = null
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError"
      setSubmitError(timedOut
        ? (t.feedback?.errorTimeout || "傳送逾時，內容仍保留，請確認網路後再試。")
        : (t.feedback?.errorMessage || "發送失敗，內容仍保留，請稍後再試。"))
    } finally {
      window.clearTimeout(timeout)
      submitAbortRef.current = null
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden p-4 sm:p-6"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 size-[44px]"
          onClick={() => handleDialogOpenChange(false)}
          disabled={isSubmitting}
          aria-label={t.feedback?.close || "關閉問題回報"}
        >
          <X aria-hidden="true" />
        </Button>

        <DialogHeader className="pr-10">
          <DialogTitle>{t.feedback?.title || "問題回報"}</DialogTitle>
          <DialogDescription>
            {t.feedback?.description || "請描述您遇到的問題，我們會盡快處理。"}
          </DialogDescription>
        </DialogHeader>

        {submitError && !successReportId && (
          <Alert variant="destructive" role="alert" aria-live="assertive" className="shrink-0">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        {successReportId ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-3 py-8 text-center" role="status" aria-live="polite">
            <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{t.feedback?.successTitle || "問題回報已送達"}</h3>
              <p className="text-sm text-muted-foreground">
                {t.feedback?.successMessage || "維護者已收到這份回報；如需聯繫，將使用您提供的電子郵件。"}
              </p>
              <p className="font-mono text-sm" data-testid="feedback-report-id">
                {(t.feedback?.reportId || "回報編號：{id}").replace("{id}", successReportId)}
              </p>
            </div>
            <Button type="button" className="min-h-[44px] min-w-28" onClick={() => handleDialogOpenChange(false)}>
              {t.feedback?.done || "完成"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 sm:pr-2">
              <div className="space-y-2">
                <Label htmlFor="email">{t.feedback?.email || "您的電子郵件"} *</Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="your.email@example.com"
                  value={reporterEmail}
                  onChange={(event) => {
                    setEmailTouched(true)
                    setFormData({ ...formData, email: event.target.value })
                  }}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "feedback-email-error feedback-email-hint" : "feedback-email-hint"}
                />
                {errors.email && <p id="feedback-email-error" role="alert" className="text-sm text-destructive">{errors.email}</p>}
                <p id="feedback-email-hint" className="text-sm text-muted-foreground">
                  {t.feedback?.emailDescription || "維護者需要回覆時使用"}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="issueType">{t.feedback?.issueType || "問題類型"} *</Label>
                  <Select required value={formData.issueType} onValueChange={(value) => setFormData({ ...formData, issueType: value })}>
                    <SelectTrigger
                      ref={issueTypeRef}
                      id="issueType"
                      className="w-full max-md:min-h-[44px]"
                      aria-invalid={Boolean(errors.issueType)}
                      aria-describedby={errors.issueType ? "feedback-issue-type-error" : undefined}
                    >
                      <SelectValue placeholder={t.feedback?.selectIssueType || "選擇類型"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">{t.feedback?.types?.bug || "功能錯誤"}</SelectItem>
                      <SelectItem value="ai">{t.feedback?.types?.ai || "AI 回答或臨床解讀問題"}</SelectItem>
                      <SelectItem value="ui">{t.feedback?.types?.ui || "介面與操作問題"}</SelectItem>
                      <SelectItem value="data">{t.feedback?.types?.data || "資料顯示問題"}</SelectItem>
                      <SelectItem value="performance">{t.feedback?.types?.performance || "速度或穩定性問題"}</SelectItem>
                      <SelectItem value="privacy">{t.feedback?.types?.privacy || "病安或隱私疑慮"}</SelectItem>
                      <SelectItem value="other">{t.feedback?.types?.other || "其他"}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.issueType && <p id="feedback-issue-type-error" role="alert" className="text-sm text-destructive">{errors.issueType}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="severity">{t.feedback?.severity || "影響程度"}</Label>
                  <Select value={formData.severity} onValueChange={(value) => setFormData({ ...formData, severity: value })}>
                    <SelectTrigger id="severity" className="w-full max-md:min-h-[44px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t.feedback?.severityLevels?.low || "仍可繼續使用"}</SelectItem>
                      <SelectItem value="medium">{t.feedback?.severityLevels?.medium || "部分操作受影響"}</SelectItem>
                      <SelectItem value="high">{t.feedback?.severityLevels?.high || "無法完成工作"}</SelectItem>
                      <SelectItem value="critical">{t.feedback?.severityLevels?.critical || "疑似病安或隱私事件"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t.feedback?.descriptionLabel || "問題描述"} *</Label>
                <Textarea
                  ref={descriptionRef}
                  id="description"
                  required
                  minLength={20}
                  placeholder={isAiResponseIssue
                    ? (t.feedback?.aiDescriptionPlaceholder || "請指出哪一段回答有問題、原本預期的內容；如有參考依據也請一併提供…")
                    : (t.feedback?.descriptionPlaceholder || "請說明發生了什麼、原本預期看到什麼…")}
                  className="min-h-[112px]"
                  value={formData.description}
                  onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={errors.description ? "feedback-description-error feedback-description-hint" : "feedback-description-hint"}
                />
                {errors.description && <p id="feedback-description-error" role="alert" className="text-sm text-destructive">{errors.description}</p>}
                <p id="feedback-description-hint" className="text-sm text-muted-foreground" aria-live="polite">
                  {isAiResponseIssue
                    ? (t.feedback?.aiDescriptionHint || "可說明內容錯誤、遺漏、與原始資料不一致或引用依據有誤")
                    : (t.feedback?.descriptionHint || "至少 20 個字元")}{" · "}{t.feedback?.noPhiHint || "請勿包含病人姓名、病歷號等個人資訊"}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <Label htmlFor="feedback-images">{t.feedback?.imagesLabel || "附加截圖（選填）"}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="max-md:min-h-[44px]"
                    disabled={isSubmitting || isPreparingImages || images.length >= MAX_FEEDBACK_IMAGES}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {isPreparingImages ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
                    {isPreparingImages ? (t.feedback?.imagesProcessing || "處理圖片中…") : (t.feedback?.imagesAction || "選擇圖片")}
                  </Button>
                  <span className="text-sm text-muted-foreground" aria-live="polite">
                    {(t.feedback?.imagesCount || "已選 {count} / {max} 張").replace("{count}", String(images.length)).replace("{max}", String(MAX_FEEDBACK_IMAGES))}
                  </span>
                </div>
                <input
                  id="feedback-images"
                  ref={imageInputRef}
                  className="sr-only"
                  type="file"
                  accept={FEEDBACK_IMAGE_ACCEPT}
                  multiple
                  disabled={isSubmitting || isPreparingImages || images.length >= MAX_FEEDBACK_IMAGES}
                  aria-describedby={imageError ? "feedback-images-hint feedback-images-error" : "feedback-images-hint"}
                  onChange={(event) => {
                    void handleImageSelection(Array.from(event.target.files || []))
                    event.target.value = ""
                  }}
                />
                <p id="feedback-images-hint" className="text-sm text-muted-foreground">
                  {t.feedback?.imagesHint || "支援 JPG、PNG、WebP；最多 3 張，合計不超過 8 MB。系統會先移除圖片中繼資料。"}
                </p>

                {images.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((image, index) => (
                      <div key={`${image.file.name}-${image.file.lastModified}-${index}`} className="min-w-0 overflow-hidden rounded-lg border bg-background">
                        <div className="relative aspect-video bg-muted/40">
                          <Image
                            src={image.previewUrl}
                            alt={(t.feedback?.imageAlt || "附加圖片 {index}").replace("{index}", String(index + 1))}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-sm"
                            className="absolute right-1 top-1 max-md:size-[44px]"
                            onClick={() => removeImage(index)}
                            aria-label={(t.feedback?.imageRemove || "移除圖片 {index}").replace("{index}", String(index + 1))}
                            disabled={isSubmitting}
                          ><X aria-hidden="true" /></Button>
                        </div>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          <p className="truncate text-foreground" title={image.file.name}>{image.file.name}</p>
                          <p>{(image.file.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {imageError && <p id="feedback-images-error" role="alert" className="text-sm text-destructive">{imageError}</p>}
              </div>

              <Collapsible open={stepsOpen} onOpenChange={setStepsOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full justify-between px-2 max-md:min-h-[44px]">
                    {t.feedback?.stepsToReproduce || "補充重現步驟（選填）"}
                    {stepsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  <Label htmlFor="steps" className="sr-only">{t.feedback?.stepsToReproduce || "補充重現步驟（選填）"}</Label>
                  <Textarea
                    id="steps"
                    placeholder={t.feedback?.stepsPlaceholder || "1. 點擊…\n2. 輸入…\n3. 發生…"}
                    className="min-h-[88px]"
                    value={formData.steps}
                    onChange={(event) => setFormData({ ...formData, steps: event.target.value })}
                  />
                  <p className="text-sm text-muted-foreground">{t.feedback?.stepsHint || "選填，幫助我們重現問題"}</p>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter className="shrink-0 border-t pt-4 max-sm:flex-col">
              <Button type="button" variant="outline" className="max-md:min-h-[44px]" onClick={() => handleDialogOpenChange(false)} disabled={isSubmitting}>
                {t.common.cancel}
              </Button>
              <Button type="submit" className="max-md:min-h-[44px]" disabled={isSubmitting || isPreparingImages}>
                {isSubmitting ? <><Loader2 className="animate-spin" aria-hidden="true" />{t.common.sending}</> : t.common.send}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
